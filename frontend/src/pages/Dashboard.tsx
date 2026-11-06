import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { LogOut, Truck } from "lucide-react";
import {
  demoPointAt,
  remainingDemoPath,
  type DemoPoint,
} from "../lib/demo-route";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api";
import TrackingMap from "../components/TrackingMap";
import ShipmentAlerts from "../components/ShipmentAlerts";
import WhatIfSimulator from "../components/WhatIfSimulator";
import LogisticsCopilot from "../components/LogisticsCopilot";

interface TrackingEvent {
  id: string;
  eventType: string;
  milestone: string | null;
  message: string | null;
  source: string;
  occurredAt: string;
}

interface WorkspaceShipment {
  id: string;
  trackingCode: string;
  originCity: string;
  destinationCity: string;
  cargoDescription: string;
  cargoType: string;
  weightKg: number;
  deadline: string;
  status: string;
  trackingStatus: string;
  urgencyScore: number | null;

  carrierName: string | null;
  onTimePercentage: number | null;
  transportMode: string | null;

  riskStatus: string | null;
  evaluatedAt: string | null;

  originLatitude: number | null;
  originLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  locationRecordedAt: string | null;
  delayCostPerHour: number;
slaAssessmentStale: boolean;
predictedDelayCostInr: number | null;

  routeRevision: number;
  recoveryRoute: {
    label: string;
    points: [number, number][];
    handoffMinutes: number;
  } | null;

  events: TrackingEvent[];
}

interface ETAResponse {
  status: "active" | "delivered";
  prediction: {
    estimated_arrival: string;
    risk_status: string;
    explanation: string;
    remaining_minutes: number;
  } | null;
  locationStale?: boolean;
  estimateBasis?: string;
}

const sequence = [
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;



const label = (value: string) => value.replaceAll("_", " ");

const date = (value: string) =>
  new Date(value).toLocaleString("en-IN");

const headings = {
  shipper: {
    title: "Shipping overview",
    description: "Monitor your shipments, deadlines and delivery risk.",
  },
  dispatcher: {
    title: "Dispatch control",
    description: "Monitor assigned shipments and coordinate recovery.",
  },
  carrier: {
    title: "Carrier operations",
    description: "Review assigned bookings and record delivery progress.",
  },
};

export default function Dashboard() {
  const { user, logout } = useAuth();

  const [shipments, setShipments] = useState<WorkspaceShipment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState("");
  const [simulating, setSimulating] = useState(false);
const simulationVersion = useRef(0);

  const [eta, setEta] = useState<ETAResponse | null>(null);
  const [etaError, setEtaError] = useState("");

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [priorityMode, setPriorityMode] =
  useState<"latest" | "impact">("impact");

  useEffect(() => {
  ++simulationVersion.current;
  setSimulating(false);

  return () => {
    ++simulationVersion.current;
  };
}, [selectedId, user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;

      try {
        const result = await apiRequest<{
          shipments: WorkspaceShipment[];
          refreshedAt: string;
        }>("/workspace", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setShipments(result.shipments);
          setRefreshedAt(result.refreshedAt);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to load dashboard"
          );
        }
      } finally {
        pending = false;

        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 10_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshKey, user?.id]);

  const selected = shipments.find(
    (shipment) => shipment.id === selectedId
  );

  const etaVersion = selected
    ? [
        selected.events[0]?.id,
        selected.routeRevision,
        selected.deadline,
        selected.trackingStatus,
      ].join(":")
    : "";

  useEffect(() => {
    if (!selectedId || !selected || selected.status !== "booked") {
      setEta(null);
      setEtaError("");
      return;
    }

    const controller = new AbortController();
    let pending = false;

    setEta(null);
    setEtaError("");

    async function loadETA() {
      if (pending) return;
      pending = true;

      try {
        const result = await apiRequest<ETAResponse>(
          `/workspace/${selectedId}/eta`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!controller.signal.aborted) {
          setEta(result);
          setEtaError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setEta(null);
          setEtaError(
            err instanceof Error ? err.message : "ETA unavailable"
          );
        }
      } finally {
        pending = false;
      }
    }

    void loadETA();
    const timer = window.setInterval(() => void loadETA(), 30_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
    // Selection content is represented by etaVersion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, etaVersion, refreshKey]);

  const filtered = useMemo(() => {
  const query = search.trim().toLowerCase();

  const matches = shipments.filter((shipment) =>
    [
      shipment.trackingCode,
      shipment.originCity,
      shipment.destinationCity,
      shipment.carrierName ?? "",
      shipment.trackingStatus,
      shipment.riskStatus ?? "",
    ].some((value) => value.toLowerCase().includes(query))
  );

  if (priorityMode === "latest") return matches;

  return [...matches].sort((a, b) => {
    const aKnown = a.predictedDelayCostInr !== null;
    const bKnown = b.predictedDelayCostInr !== null;

    if (aKnown !== bKnown) {
      return aKnown ? -1 : 1;
    }

    return (
      (b.predictedDelayCostInr ?? 0) -
        (a.predictedDelayCostInr ?? 0) ||
      new Date(a.deadline).getTime() -
        new Date(b.deadline).getTime()
    );
  });
}, [shipments, search, priorityMode]);

  if (!user) return null;

  const heading = headings[user.role];

  const active = shipments.filter(
    (shipment) =>
      shipment.status === "booked" &&
      shipment.trackingStatus !== "delivered"
  );

  const delivered = shipments.filter(
    (shipment) => shipment.trackingStatus === "delivered"
  ).length;

  const risky = active.filter(
    (shipment) =>
      shipment.riskStatus &&
      shipment.riskStatus !== "On Track"
  ).length;

  const nextMilestone = selected
    ? sequence[
        sequence.findIndex(
          (milestone) => milestone === selected.trackingStatus
        ) + 1
      ]
    : undefined;

  async function handleLogout() {
    try {
      await logout();
      window.location.replace("/");
    } catch {
      setError("Unable to log out");
    }
  }

  async function carrierUpdate(

    
    update:
      | {
          eventType: "location";
          latitude: number;
          longitude: number;
        }
      | {
          eventType: "milestone";
          milestone: string;
        }
  ) {

    if (simulating) return;
    if (!selected) return;

    setSaving(true);
    setMessage("");

    try {
      await apiRequest(
        `/workspace/${selected.id}/carrier-update`,
        {
          method: "POST",
          body: JSON.stringify({
            ...update,
            routeRevision: selected.routeRevision,
          }),
        }
      );

      setMessage("Update saved.");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Unable to save update"
      );
    } finally {
      setSaving(false);
    }
  }

  function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!latitude.trim() || !longitude.trim()) {
      setMessage("Enter both coordinates.");
      return;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      setMessage("Enter valid latitude and longitude.");
      return;
    }

    void carrierUpdate({
      eventType: "location",
      latitude: lat,
      longitude: lng,
    });
  }

  function stopCarrierSimulation() {
  ++simulationVersion.current;
  setSimulating(false);
  setMessage("Simulation stopped.");
}

async function startCarrierSimulation() {
  if (
    !selected ||
    user?.role !== "carrier" ||
    saving ||
    simulating
  ) return;

  const version = ++simulationVersion.current;

  setSimulating(true);
  setMessage("");

  try {
    // Fetch current assignment, position and route revision first.
    const workspace = await apiRequest<{
      shipments: WorkspaceShipment[];
    }>("/workspace", {
      cache: "no-store",
    });

    if (version !== simulationVersion.current) return;

    const shipment = workspace.shipments.find(
      (item) => item.id === selected.id
    );

    if (!shipment) {
      throw new Error(
        "This shipment is no longer assigned to your carrier."
      );
    }

    if (
      shipment.status !== "booked" ||
      !["picked_up", "in_transit", "out_for_delivery"].includes(
        shipment.trackingStatus
      )
    ) {
      throw new Error(
        "Mark the shipment Picked Up before simulating movement."
      );
    }

    if (
      shipment.destinationLatitude === null ||
      shipment.destinationLongitude === null
    ) {
      throw new Error(
        "Save the shipment route coordinates from the shipper account first."
      );
    }

    const startLatitude =
      shipment.currentLatitude ?? shipment.originLatitude;

    const startLongitude =
      shipment.currentLongitude ?? shipment.originLongitude;

    if (startLatitude === null || startLongitude === null) {
      throw new Error("Pickup or current location is missing.");
    }

    const start: DemoPoint = [startLongitude, startLatitude];

    const destination: DemoPoint = [
      shipment.destinationLongitude,
      shipment.destinationLatitude,
    ];

    const points: DemoPoint[] = shipment.recoveryRoute
      ? remainingDemoPath(
          shipment.recoveryRoute.points,
          start
        )
      : [start, destination];

    for (let step = 0; step <= 20; step++) {
      if (version !== simulationVersion.current) break;

      const point = demoPointAt(points, step / 20);

      await apiRequest(
        `/workspace/${shipment.id}/carrier-update`,
        {
          method: "POST",
          body: JSON.stringify({
            eventType: "location",
            longitude: point[0],
            latitude: point[1],
            routeRevision: shipment.routeRevision,
            message:
              `Carrier demo simulation: ${step * 5}%` +
              (shipment.recoveryRoute
                ? ` — ${shipment.recoveryRoute.label}`
                : ""),
          }),
        }
      );

      if (version !== simulationVersion.current) break;

      // Refresh this dashboard. Socket.IO also notifies
      // the shipper's existing tracking panel.
      setRefreshKey((value) => value + 1);
      setMessage(`Simulation progress: ${step * 5}%`);

      if (step < 20) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 2000)
        );
      }
    }

    if (version === simulationVersion.current) {
      setMessage(
        "Simulation finished. Mark the delivery milestones separately."
      );
    }
  } catch (err) {
    if (version === simulationVersion.current) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Carrier simulation failed"
      );
    }
  } finally {
    if (version === simulationVersion.current) {
      setSimulating(false);
    }
  }
}

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="brand" to="/dashboard">
          <span className="brand-mark"><Truck size={20} /></span>
          SwiftChain
        </Link>

        <div className="role-dashboard-nav">
          {user.role === "shipper" && (
            <Link to="/shipments">Manage shipments</Link>
          )}

          {user.role === "dispatcher" && (
            <Link to="/dispatcher/recovery">Recovery workspace</Link>
          )}

          <button
            type="button"
            className="logout-button"
            onClick={() => void handleLogout()}
          >
            <LogOut size={17} /> Logout
          </button>
        </div>
      </header>

      <div className="role-dashboard">
        <span className="section-eyebrow eyebrow-dark">
          {user.role.toUpperCase()} WORKSPACE
        </span>

        <h1>{heading.title}</h1>
        <p>{heading.description}</p>
        <p className="tracking-muted">
          {user.fullName} · {user.organizationName ?? "Independent account"}
        </p>

        <div className="role-dashboard-kpis">
          {[
            ["Loaded shipments", shipments.length],
            ["Active bookings", active.length],
            ["Delivered", delivered],
            ["Active with SLA risk", risky],
          ].map(([title, value]) => (
            <article key={String(title)}>
              <span>{title}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>

        <section className="role-dashboard-card">
          <div className="role-dashboard-toolbar">
            <div>
              <h2>
                {user.role === "shipper"
                  ? "Your shipments"
                  : "Assigned shipments"}
              </h2>
              <p className="tracking-muted">
                Latest 200 accessible shipments. Overview refreshes
                every 10 seconds.
              </p>
            </div>

            <input
              type="search"
              aria-label="Search dashboard shipments"
              placeholder="Search route, carrier or status"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
  aria-label="Shipment priority order"
  value={priorityMode}
  onChange={(event) =>
    setPriorityMode(event.target.value as "latest" | "impact")
  }
>
  <option value="impact">Highest estimated delay exposure</option>
  <option value="latest">Newest shipments</option>
</select>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              Refresh
            </button>
          </div>

          {error && <p className="form-alert" role="alert">{error}</p>}
          {loading && <p>Loading workspace...</p>}

          {!loading && filtered.length === 0 && (
            <p>No matching shipments.</p>
          )}

          <div className="role-dashboard-scroll">
            <table className="role-dashboard-table">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Route</th>
                  <th>Carrier</th>
                  <th>Progress</th>
                  <th>Last SLA risk</th>
                  <th>Delay exposure</th>
                  <th>Deadline</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filtered.map((shipment) => (
                  <tr key={shipment.id}>
                    <td>{shipment.trackingCode}</td>
                    <td>
                      {shipment.originCity} → {shipment.destinationCity}
                    </td>
                    <td>{shipment.carrierName ?? "Not booked"}</td>
                    <td>{label(shipment.trackingStatus)}</td>
                    <td>
                      {shipment.trackingStatus === "delivered"
                        ? "Delivered"
                        : shipment.riskStatus ?? "Not assessed"}
                    </td>
                    <td>
  {shipment.predictedDelayCostInr === null ? (
    <span className="tracking-muted">
      {shipment.trackingStatus === "delivered" ||
      shipment.status !== "booked"
        ? "Not applicable"
        : "Awaiting fresh assessment"}
    </span>
  ) : (
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(shipment.predictedDelayCostInr)
  )}
</td>
                    <td>{date(shipment.deadline)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setSelectedId(shipment.id);
                          setMessage("");
                          setLatitude("");
                          setLongitude("");
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {refreshedAt && (
            <p className="tracking-muted">
              Overview updated {date(refreshedAt)}
            </p>
          )}
        </section>

        {selected && (
          <section className="role-dashboard-card">
            <div className="role-dashboard-toolbar">
              <h2>{selected.trackingCode}</h2>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedId("")}
              >
                Close details
              </button>
            </div>

            <p>
              {selected.cargoDescription} · {selected.weightKg} kg
              {" · "}Stored urgency: {selected.urgencyScore ?? "—"}/100
            </p>

            <p>
              Carrier: {selected.carrierName ?? "Not booked"}
              {selected.onTimePercentage !== null &&
                ` · On-time metric: ${selected.onTimePercentage}%`}
            </p>

            <TrackingMap
              origin={
                selected.originLongitude !== null &&
                selected.originLatitude !== null
                  ? [selected.originLongitude, selected.originLatitude]
                  : null
              }
              destination={
                selected.destinationLongitude !== null &&
                selected.destinationLatitude !== null
                  ? [
                      selected.destinationLongitude,
                      selected.destinationLatitude,
                    ]
                  : null
              }
              current={
                selected.currentLongitude !== null &&
                selected.currentLatitude !== null
                  ? [selected.currentLongitude, selected.currentLatitude]
                  : null
              }
              routePoints={selected.recoveryRoute?.points}
            />

            {selected.locationRecordedAt && (
              <p className="tracking-muted">
                Location recorded {date(selected.locationRecordedAt)}
              </p>
            )}

            {selected.recoveryRoute && (
              <p>
                Approved route: {selected.recoveryRoute.label}
              </p>
            )}

            <div className="role-dashboard-detail-grid">
              <article>
                <h3>ETA and risk</h3>
                
                {etaError && <p role="status">{etaError}</p>}

                {selected.status !== "booked" ? (
                  <p>ETA becomes available after booking.</p>
                ) : eta?.status === "delivered" ? (
                  <p>Delivered.</p>
                ) : eta?.prediction ? (
                  <>
                    <p><strong>{eta.prediction.risk_status}</strong></p>
                    <p>
                      Arrival: {date(eta.prediction.estimated_arrival)}
                    </p>
                    <p>{eta.prediction.explanation}</p>

                    {eta.locationStale && (
                      <p className="form-alert">
                        Location is missing or stale.
                      </p>
                    )}

                    <p className="tracking-muted">
                      {eta.estimateBasis}
                    </p>
                  </>
                ) : !etaError ? (
                  <p>Calculating ETA...</p>
                ) : null}
              </article>

              <article>
                <h3>Recent tracking history</h3>

                {selected.events.length === 0 && (
                  <p>No tracking events yet.</p>
                )}

                <ul className="role-dashboard-events">
                  {selected.events.map((event) => (
                    <li key={event.id}>
                      <strong>
                        {event.milestone
                          ? label(event.milestone)
                          : "Location update"}
                      </strong>
                      <span>{event.message}</span>
                      <small>
                        {date(event.occurredAt)} · {event.source}
                      </small>
                    </li>
                  ))}
                </ul>
              </article>

              {selected.status === "booked" &&
  selected.trackingStatus !== "delivered" && (
    <WhatIfSimulator
      key={selected.id}
      shipmentId={selected.id}
    />
  )}

              
            </div>

            {user.role === "carrier" &&
              selected.status === "booked" &&
              selected.trackingStatus !== "delivered" && (
                <section className="role-dashboard-carrier">
                  <h3>Record shipment progress</h3>

                  <p className="tracking-muted">
                    Manual carrier updates. These do not read GPS
                    automatically.
                  </p>

                  {message && <p role="status">{message}</p>}

                  {nextMilestone && nextMilestone !== "booked" && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving}
                      onClick={() => void carrierUpdate({
                        eventType: "milestone",
                        milestone: nextMilestone,
                      })}
                    >
                      Mark {label(nextMilestone)}
                    </button>
                  )}

                  <div className="tracking-actions">
                    <div className="tracking-actions">
  {simulating ? (
    <button
      type="button"
      className="danger-button"
      onClick={stopCarrierSimulation}
    >
      Stop simulation
    </button>
  ) : (
    <button
      type="button"
      className="primary-button"
      disabled={
        saving ||
        !["picked_up", "in_transit", "out_for_delivery"].includes(
          selected.trackingStatus
        )
      }
      onClick={() => void startCarrierSimulation()}
    >
      Start demo simulation
    </button>
  )}
</div>

<p className="tracking-muted">
  Simulates movement over approximately 40 seconds.
  Approved recovery waypoints are followed automatically.
  Stop simulation before reviewing transfer recovery.
  Delivery milestones are recorded separately.
</p>  
  <button
    type="button"
    className="secondary-button"
    disabled={saving || simulating}
    onClick={() => {
      setLatitude("18.5204");
      setLongitude("73.8567");
    }}
  >
    Demo: Pune pickup
  </button>

  <button
    type="button"
    className="secondary-button"
    disabled={saving || simulating}

    onClick={() => {
      setLatitude("18.6500");
      setLongitude("73.6000");
    }}
  >
    Demo: approaching Lonavala
  </button>

  <button
    type="button"
    className="secondary-button"
    disabled={saving || simulating}
    onClick={() => {
      setLatitude("18.7557");
      setLongitude("73.4091");
    }}
  >
    Demo: Lonavala transfer hub
  </button>

  <button
    type="button"
    className="secondary-button"
    disabled={saving || simulating}
    onClick={() => {
      setLatitude("19.0760");
      setLongitude("72.8777");
    }}
  >
    Demo: Mumbai destination
  </button>
</div>

                  <form
                    className="role-dashboard-location"
                    onSubmit={submitLocation}
                  >
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        required
                        value={latitude}
                        onChange={(event) =>
                          setLatitude(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        required
                        value={longitude}
                        onChange={(event) =>
                          setLongitude(event.target.value)
                        }
                      />
                    </label>

                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={saving || simulating}
                    >
                      {saving ? "Saving..." : "Save location"}
                    </button>
                  </form>
                </section>
              )}
          </section>
        )}

        {user.role === "shipper" && <ShipmentAlerts />}
        <LogisticsCopilot
  key={`${user.id}:${selectedId || "workspace"}`}
  shipmentId={selectedId || undefined}
  shipmentLabel={selected?.trackingCode}
/>

{user.role === "shipper" && <ShipmentAlerts />}
      </div>
    </main>
  );
}