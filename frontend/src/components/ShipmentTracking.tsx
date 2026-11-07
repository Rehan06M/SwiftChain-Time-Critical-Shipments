import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";

import TrackingMap from "./TrackingMap";
import type { MapPoint } from "./TrackingMap";

import {
  getTracking,
  saveTrackingUpdate,
  saveTrackingRoute,
  type TrackingData,
  type TrackingUpdate,
} from "../lib/tracking";

import ShipmentETA from "./ShipmentETA";
import { apiRequest } from "../lib/api";

const API_URL =
  import.meta.env.VITE_API_URL ??
  "http://localhost:5000/api";

// Socket.IO connects to the server origin, without /api.
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  new URL(API_URL, window.location.origin).origin;

const milestones = [
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

const label = (value: string) =>
  value
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-IN");

function parsePoint(
  latitude: string,
  longitude: string
): MapPoint | null {
  if (!latitude.trim() || !longitude.trim()) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return [lng, lat];
}

export default function ShipmentTracking({
  shipmentId,
}: {
  shipmentId: string;
}) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Connecting");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [destinationLat, setDestinationLat] = useState("");
  const [destinationLng, setDestinationLng] = useState("");

  const requestVersion = useRef(0);
  const simulationVersion = useRef(0);
  const coordinatesLoaded = useRef(false);
  const lastRouteRevision = useRef<number | null>(null);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;

    try {
      const result = await getTracking(shipmentId);

      if (version !== requestVersion.current) return;

      setData(result);
      if (
        lastRouteRevision.current !== null &&
        lastRouteRevision.current !== result.shipment.routeRevision
      ) {
        ++simulationVersion.current;
        setRunning(false);
      }

      lastRouteRevision.current = result.shipment.routeRevision;
      setError("");

      if (!coordinatesLoaded.current) {
        const shipment = result.shipment;

        setOriginLat(
          shipment.originLatitude?.toString() ?? ""
        );
        setOriginLng(
          shipment.originLongitude?.toString() ?? ""
        );
        setDestinationLat(
          shipment.destinationLatitude?.toString() ?? ""
        );
        setDestinationLng(
          shipment.destinationLongitude?.toString() ?? ""
        );

        coordinatesLoaded.current = true;
      }
    } catch (err) {
      if (version !== requestVersion.current) return;

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load tracking"
      );
    }
  }, [shipmentId]);


  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        void load();
      }
    });


    const socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,

      auth: (callback) => {
        void apiRequest<{ ticket: string }>(
          "/auth/socket-ticket"
        )
          .then(({ ticket }) => {
            callback({ ticket });
          })
          .catch((error) => {
            console.error(
              "Socket authentication failed:",
              error
            );

            callback({ ticket: "" });
          });
      },
    });


    socket.on("connect", () => {
      setConnection("Subscribing");

      socket.timeout(8000).emit(
        "tracking:subscribe",
        shipmentId,
        (
          err: Error | null,
          response?: { ok: boolean; message?: string }
        ) => {
          if (err || !response?.ok) {
            setConnection("Subscription failed");
            setError(
              response?.message ??
              "Unable to subscribe to live tracking"
            );
            return;
          }

          setConnection("Live");
          // Recover updates missed during a disconnect.
          void load();
        }
      );
    });

    socket.on("tracking:updated", (event: {
      shipmentId: string;
    }) => {
      if (event.shipmentId === shipmentId) {
        void load();
      }
    });

    socket.on("disconnect", () => {
      setConnection("Disconnected");
    });

    socket.on("connect_error", (err: Error) => {
      setConnection("Connection failed");
      setError(err.message);
    });

    socket.connect();


    const requestVersionRef = requestVersion;
    const simulationVersionRef = simulationVersion;

    return () => {
      active = false;
      ++requestVersionRef.current;
      ++simulationVersionRef.current;
      socket.disconnect();
    };

  }, [shipmentId, load]);

  const origin = useMemo(
    () => parsePoint(originLat, originLng),
    [originLat, originLng]
  );

  const destination = useMemo(
    () => parsePoint(destinationLat, destinationLng),
    [destinationLat, destinationLng]
  );

  const current = useMemo<MapPoint | null>(
    () =>
      data?.latestLocation
        ? [
          data.latestLocation.longitude,
          data.latestLocation.latitude,
        ]
        : null,
    [data]
  );

  const currentIndex = milestones.findIndex(
    (value) => value === data?.trackingStatus
  );

  const nextMilestone =
    currentIndex >= 0
      ? milestones[currentIndex + 1]
      : undefined;

  const canUpdate =
    data?.shipment.status === "booked" &&
    data.trackingStatus !== "delivered";

  function remainingDemoPath(
    points: MapPoint[],
    current: MapPoint
  ): MapPoint[] {
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index]!;
      const end = points[index + 1]!;
      const scale = Math.cos(current[1] * Math.PI / 180);

      const dx = (end[0] - start[0]) * scale;
      const dy = end[1] - start[1];
      const px = (current[0] - start[0]) * scale;
      const py = current[1] - start[1];

      const length = dx * dx + dy * dy;
      const fraction = length > 0
        ? Math.max(0, Math.min(1, (px * dx + py * dy) / length))
        : 0;

      const distance =
        (px - dx * fraction) ** 2 +
        (py - dy * fraction) ** 2;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return [current, ...points.slice(bestIndex + 1)];
  }

  function demoPointAt(
    points: MapPoint[],
    progress: number
  ): MapPoint {
    const lengths = points.slice(1).map((point, index) => {
      const start = points[index]!;
      const scale = Math.cos(
        ((start[1] + point[1]) / 2) * Math.PI / 180
      );

      return Math.hypot(
        (point[0] - start[0]) * scale,
        point[1] - start[1]
      );
    });

    let remaining = lengths.reduce((a, b) => a + b, 0) * progress;

    for (let index = 0; index < lengths.length; index++) {
      const length = lengths[index]!;

      if (remaining <= length && length > 0) {
        const fraction = remaining / length;
        const start = points[index]!;
        const end = points[index + 1]!;

        return [
          start[0] + (end[0] - start[0]) * fraction,
          start[1] + (end[1] - start[1]) * fraction,
        ];
      }

      remaining -= length;
    }

    return points[points.length - 1]!;
  }
  async function save(update: TrackingUpdate) {
    setBusy(true);
    setError("");



    try {
      const payload = {
        ...update,
        routeRevision: data?.shipment.routeRevision ?? 0,
      };

      await saveTrackingUpdate(shipmentId, payload);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save tracking update"
      );
    } finally {
      setBusy(false);
    }
  }

  async function startSimulation() {
    if (!origin || !destination || !data || !canUpdate || running) {
      setError("Enter valid route coordinates.");
      return;
    }

    const version = ++simulationVersion.current;
    const routeRevision = data.shipment.routeRevision;
    const approvedRoute = data.shipment.recoveryRoute;

    setRunning(true);
    setError("");

    try {
      // Only initialize coordinates before movement.
      if (!data.latestLocation && !approvedRoute) {
        await saveTrackingRoute(shipmentId, {
          originLatitude: origin[1],
          originLongitude: origin[0],
          destinationLatitude: destination[1],
          destinationLongitude: destination[0],
        });
      }

      if (version !== simulationVersion.current) return;

      const start: MapPoint = data.latestLocation
        ? [
          data.latestLocation.longitude,
          data.latestLocation.latitude,
        ]
        : origin;

      const points: MapPoint[] = approvedRoute
        ? remainingDemoPath(approvedRoute.points, start)
        : [start, destination];

      for (let step = 0; step <= 20; step++) {
        if (version !== simulationVersion.current) break;

        const point = demoPointAt(points, step / 20);

        await apiRequest(`/tracking/${shipmentId}/events`, {
          method: "POST",
          body: JSON.stringify({
            eventType: "location",
            longitude: point[0],
            latitude: point[1],
            routeRevision,
            message: approvedRoute
              ? `Recovery simulation: ${approvedRoute.label}`
              : `Demo journey: ${step * 5}%`,
          }),
        });

        if (version !== simulationVersion.current) break;

        await load();

        if (step < 20) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, 2000)
          );
        }
      }
    } catch (err) {
      if (version === simulationVersion.current) {
        setError(
          err instanceof Error ? err.message : "Simulation stopped"
        );
      }
    } finally {
      if (version === simulationVersion.current) {
        setRunning(false);
      }
    }
  }

  function stopSimulation() {
    ++simulationVersion.current;
    setRunning(false);
  }

  async function handleSaveRoute() {
    if (!origin || !destination) {
      setError("Enter valid pickup and destination coordinates.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await saveTrackingRoute(shipmentId, {
        originLatitude: origin[1],
        originLongitude: origin[0],
        destinationLatitude: destination[1],
        destinationLongitude: destination[0],
      });

      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save route"
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section className="tracking-panel">
        <h3>Shipment Tracking</h3>
        <p>{error || "Loading tracking..."}</p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void load()}
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="tracking-panel">
      <div className="tracking-heading">
        <div>
          <h3>Shipment Tracking</h3>
          <p>
            {data.shipment.originCity} →{" "}
            {data.shipment.destinationCity}
          </p>
        </div>

        <span className="tracking-connection">
          {connection}
        </span>
      </div>

      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}

      <ol className="tracking-milestones">
        {milestones.map((milestone, index) => (
          <li
            key={milestone}
            className={
              currentIndex >= index ? "is-complete" : ""
            }
            aria-current={
              data.trackingStatus === milestone
                ? "step"
                : undefined
            }
          >
            {label(milestone)}
          </li>
        ))}
      </ol>

      <p>
        Current status:{" "}
        <strong>{label(data.trackingStatus)}</strong>
      </p>

      {data.shipment.recoveryRoute && (
        <div className="tracking-simulator">
          <h4>Approved transfer route</h4>
          <p>{data.shipment.recoveryRoute.label}</p>
          <p>
            Estimated handoff/pickup allowance:{" "}
            {data.shipment.recoveryRoute.handoffMinutes} minutes.
          </p>
          <p className="tracking-muted">
            This allowance remains in the ETA until the recorded
            position passes the transfer hub. It is a demo estimate,
            not confirmation of a physical handoff.
          </p>
        </div>
      )}

      <TrackingMap
        origin={origin}
        destination={destination}
        current={current}
        routePoints={data.shipment.recoveryRoute?.points}
      />
      <ShipmentETA
        shipmentId={shipmentId}
        trackingVersion={`${data.events[0]?.id ?? ""}:${data.shipment.routeRevision}:${data.shipment.destinationLatitude}:${data.shipment.destinationLongitude}`}
      />

      {data.latestLocation && (
        <p className="tracking-muted">
          Latest location:{" "}
          {data.latestLocation.latitude.toFixed(5)},{" "}
          {data.latestLocation.longitude.toFixed(5)}
          {" · "}
          {formatDate(data.latestLocation.occurredAt)}
          {" · "}
          {data.latestLocation.source}
        </p>
      )}

      {canUpdate && (
        <div className="tracking-simulator">
          <h4>Demo controls</h4>

          <p className="tracking-muted">
            Coordinates entered here are used for this demo
            session. Location events are saved to the database.
            Finishing the animation does not mark the shipment
            delivered.
          </p>

          <div className="tracking-coordinate-grid">
            <label>
              Pickup latitude
              <input
                type="number"
                step="any"
                value={originLat}
                disabled={running}
                onChange={(event) =>
                  setOriginLat(event.target.value)
                }
              />
            </label>

            <label>
              Pickup longitude
              <input
                type="number"
                step="any"
                value={originLng}
                disabled={running}
                onChange={(event) =>
                  setOriginLng(event.target.value)
                }
              />
            </label>

            <label>
              Destination latitude
              <input
                type="number"
                step="any"
                value={destinationLat}
                disabled={running}
                onChange={(event) =>
                  setDestinationLat(event.target.value)
                }
              />
            </label>

            <label>
              Destination longitude
              <input
                type="number"
                step="any"
                value={destinationLng}
                disabled={running}
                onChange={(event) =>
                  setDestinationLng(event.target.value)
                }
              />
            </label>
          </div>

          <div className="tracking-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy || running || !origin || !destination}
              onClick={() => void handleSaveRoute()}
            >
              Save route coordinates
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={running || busy}
              onClick={() => {
                // Explicit example route: Pune to Mumbai.
                setOriginLat("18.5204");
                setOriginLng("73.8567");
                setDestinationLat("19.0760");
                setDestinationLng("72.8777");
              }}
            >
              Use Pune–Mumbai demo coordinates
            </button>

            {running ? (
              <button
                type="button"
                className="danger-button"
                onClick={stopSimulation}
              >
                Stop simulation
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !origin || !destination}
                onClick={() => void startSimulation()}
              >
                Simulate location
              </button>
            )}

            {nextMilestone && nextMilestone !== "booked" && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy || running}
                onClick={() =>
                  void save({
                    eventType: "milestone",
                    milestone: nextMilestone,
                  })
                }
              >
                {busy
                  ? "Saving..."
                  : `Mark ${label(nextMilestone)}`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="tracking-history">
        <h4>Tracking history</h4>

        {data.events.length === 0 ? (
          <p className="tracking-muted">
            No tracking updates yet.
          </p>
        ) : (
          <ul>
            {data.events.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.eventType === "milestone"
                    ? label(event.milestone ?? "")
                    : "Location update"}
                </strong>

                <span>
                  {event.message ||
                    (event.latitude !== null &&
                      event.longitude !== null
                      ? `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`
                      : "Milestone recorded")}
                </span>

                <small>
                  {formatDate(event.occurredAt)}
                  {" · "}
                  {event.source}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}