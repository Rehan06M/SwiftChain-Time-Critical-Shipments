import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
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
import WorkspaceLayout from "../components/WorkspaceLayout";
import {
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  RefreshCw,
  Eye,
  X,
  Play,
  Square,
  Navigation,
  Send,
  ArrowRight,
  ShieldAlert,
  Info,
  Truck,
} from "lucide-react";

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
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const headings = {
  shipper: {
    title: "Shipping Overview",
    description: "Monitor your shipments, deadlines, and delivery risks.",
  },
  dispatcher: {
    title: "Dispatch Control",
    description: "Monitor assigned shipments and coordinate recovery.",
  },
  carrier: {
    title: "Carrier Operations",
    description: "Review assigned bookings and record delivery progress.",
  },
};

export default function Dashboard() {
  const { user } = useAuth();

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

  const [priorityMode, setPriorityMode] = useState<"latest" | "impact">(
    "impact"
  );

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

  const selected = shipments.find((shipment) => shipment.id === selectedId);

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
      ].some((val) => val.toLowerCase().includes(query))
    );

    if (priorityMode === "latest") return matches;

    return [...matches].sort((a, b) => {
      const aKnown = a.predictedDelayCostInr !== null;
      const bKnown = b.predictedDelayCostInr !== null;

      if (aKnown !== bKnown) {
        return aKnown ? -1 : 1;
      }

      return (
        (b.predictedDelayCostInr ?? 0) - (a.predictedDelayCostInr ?? 0) ||
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
    });
  }, [shipments, search, priorityMode]);

  if (!user) return null;

  const heading = headings[user.role];

  const active = shipments.filter(
    (shipment) =>
      shipment.status === "booked" && shipment.trackingStatus !== "delivered"
  );

  const delivered = shipments.filter(
    (shipment) => shipment.trackingStatus === "delivered"
  ).length;


  const risky = active.filter(
    (shipment) =>
      !shipment.slaAssessmentStale &&
      shipment.riskStatus !== null &&
      shipment.riskStatus !== "On Track"
  ).length;

  const nextMilestone = selected
    ? sequence[
    sequence.findIndex(
      (milestone) => milestone === selected.trackingStatus
    ) + 1
    ]
    : undefined;

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
      await apiRequest(`/workspace/${selected.id}/carrier-update`, {
        method: "POST",
        body: JSON.stringify({
          ...update,
          routeRevision: selected.routeRevision,
        }),
      });

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
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
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
    )
      return;

    const version = ++simulationVersion.current;

    setSimulating(true);
    setMessage("");

    try {
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
        ? remainingDemoPath(shipment.recoveryRoute.points, start)
        : [start, destination];

      for (let step = 0; step <= 20; step++) {
        if (version !== simulationVersion.current) break;

        const point = demoPointAt(points, step / 20);

        await apiRequest(`/workspace/${shipment.id}/carrier-update`, {
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
        });

        if (version !== simulationVersion.current) break;

        setRefreshKey((value) => value + 1);
        setMessage(`Simulation progress: ${step * 5}%`);

        if (step < 20) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
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
          err instanceof Error ? err.message : "Carrier simulation failed"
        );
      }
    } finally {
      if (version === simulationVersion.current) {
        setSimulating(false);
      }
    }
  }

  const kpis = [
    {
      title: "Loaded Shipments",
      value: shipments.length,
      icon: Package,
      tone: "neutral",
    },
    {
      title: "Active Bookings",
      value: active.length,
      icon: Clock,
      tone: "primary",
    },
    {
      title: "Delivered",
      value: delivered,
      icon: CheckCircle2,
      tone: "success",
    },
    {
      title: "Active with SLA Risk",
      value: risky,
      icon: AlertTriangle,
      tone: risky > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <WorkspaceLayout
      pageTitle={heading.title}
      pageSubtitle={heading.description}
      pageEyebrow={`${user.role.toUpperCase()} WORKSPACE`}
      refreshedAt={refreshedAt}
      headerActions={
        <button
          type="button"
          className="workspace-action-btn"
          onClick={() => setRefreshKey((v) => v + 1)}
          title="Refresh workspace data"
        >
          <RefreshCw size={15} />
          <span>Refresh</span>
        </button>
      }
    >
      <div className="role-dashboard">
        {/* KPI Metrics Grid */}
        <div className="role-dashboard-kpis">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <article
                key={kpi.title}
                className={`kpi-card kpi-tone-${kpi.tone}`}
              >
                <div className="kpi-icon-wrap">
                  <Icon size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-title">{kpi.title}</span>
                  <strong className="kpi-value">{kpi.value}</strong>
                </div>
              </article>
            );
          })}
        </div>

        {/* Shipments Table Card */}
        <section className="role-dashboard-card">
          <div className="role-dashboard-toolbar">
            <div className="toolbar-header-block">
              <h2>
                {user.role === "shipper"
                  ? "Your Shipments"
                  : "Assigned Shipments"}
              </h2>
              <p className="tracking-muted">
                Displaying latest accessible shipments · Auto-refreshes every 10s
              </p>
            </div>

            <div className="toolbar-controls-block">
              <div className="search-input-wrap">
                <Search size={16} className="search-icon" />
                <input
                  type="search"
                  aria-label="Search dashboard shipments"
                  placeholder="Search route, carrier, or status..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <select
                className="priority-select"
                aria-label="Shipment priority order"
                value={priorityMode}
                onChange={(event) =>
                  setPriorityMode(event.target.value as "latest" | "impact")
                }
              >
                <option value="impact">Highest Delay Exposure</option>
                <option value="latest">Newest Shipments</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="form-alert" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="dashboard-loading-state">
              <RefreshCw size={24} className="spin-icon" />
              <span>Loading workspace shipments...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="dashboard-empty-state">
              <Package size={36} />
              <p>No matching shipments found.</p>
              {search && (
                <small className="tracking-muted">
                  Try adjusting your search criteria.
                </small>
              )}
            </div>
          ) : (
            <div className="role-dashboard-scroll">
              <table className="role-dashboard-table">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Route</th>
                    <th>Carrier</th>
                    <th>Progress</th>
                    <th>Last SLA Risk</th>
                    <th>Delay Exposure</th>
                    <th>Deadline</th>
                    <th className="th-action">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((shipment) => {
                    const isSelected = shipment.id === selectedId;
                    const progressKey = shipment.trackingStatus.toLowerCase();
                    const riskStale = shipment.slaAssessmentStale;
                    const riskKey = shipment.riskStatus
                      ? shipment.riskStatus.toLowerCase().replaceAll(" ", "-")
                      : "none";

                    return (
                      <tr
                        key={shipment.id}
                        className={isSelected ? "is-selected-row" : ""}
                      >
                        <td className="td-tracking">
                          <strong>{shipment.trackingCode}</strong>
                          <span className="td-cargo-type">
                            {shipment.cargoType} · {shipment.weightKg}kg
                          </span>
                        </td>
                        <td className="td-route">
                          <span className="route-text">
                            {shipment.originCity}
                            <ArrowRight size={13} className="route-arrow-icon" />
                            {shipment.destinationCity}
                          </span>
                        </td>
                        <td className="td-carrier">
                          {shipment.carrierName ? (
                            <span className="carrier-name">
                              {shipment.carrierName}
                            </span>
                          ) : (
                            <span className="tracking-muted">Not booked</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge badge-progress progress-${progressKey}`}
                          >
                            {label(shipment.trackingStatus)}
                          </span>
                        </td>
                        <td>
                          {shipment.trackingStatus === "delivered" ? (
                            <span className="badge badge-risk risk-delivered">
                              Delivered
                            </span>
                          ) : riskStale ? (
                            <span
                              className="badge badge-risk risk-unassessed"
                              title={
                                shipment.riskStatus
                                  ? `Last recorded risk: ${shipment.riskStatus}. Assessment is stale.`
                                  : "No recent SLA assessment is available."
                              }
                            >
                              {shipment.riskStatus
                                ? "Assessment stale"
                                : "Not assessed"}
                            </span>
                          ) : shipment.riskStatus ? (
                            <span
                              className={`badge badge-risk risk-${riskKey}`}
                            >
                              {shipment.riskStatus}
                            </span>
                          ) : (
                            <span className="badge badge-risk risk-unassessed">
                              Not assessed
                            </span>
                          )}
                        </td>
                        <td className="td-exposure">
                          {shipment.predictedDelayCostInr === null ? (
                            <span className="exposure-muted">
                              {shipment.trackingStatus === "delivered" ||
                                shipment.status !== "booked"
                                ? "Not applicable"
                                : "Awaiting fresh assessment"}
                            </span>
                          ) : (
                            <strong className="exposure-val">
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 0,
                              }).format(shipment.predictedDelayCostInr)}
                            </strong>
                          )}
                        </td>
                        <td className="td-date">{date(shipment.deadline)}</td>
                        <td className="td-action">
                          <button
                            type="button"
                            className={`secondary-button action-inspect-btn ${isSelected ? "is-active" : ""
                              }`}
                            onClick={() => {
                              setSelectedId(
                                isSelected ? "" : shipment.id
                              );
                              setMessage("");
                              setLatitude("");
                              setLongitude("");
                            }}
                          >
                            <Eye size={14} />
                            <span>{isSelected ? "Selected" : "Inspect"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Selected Shipment Details Panel */}
        {selected && (
          <section
            className="role-dashboard-card selected-shipment-panel"
            aria-labelledby="selected-shipment-heading"
          >
            <div className="selected-shipment-header">
              <div className="selected-title-group">
                <span className="section-eyebrow eyebrow-dark">
                  ACTIVE SELECTION
                </span>
                <h2 id="selected-shipment-heading">
                  {selected.trackingCode}
                </h2>
                <div className="selected-meta-chips">
                  <span className="meta-chip">
                    Route: {selected.originCity} → {selected.destinationCity}
                  </span>
                  <span className="meta-chip">
                    Cargo: {selected.cargoDescription} ({selected.weightKg} kg)
                  </span>
                  <span className="meta-chip">
                    Carrier: {selected.carrierName ?? "Not booked"}
                  </span>
                  {selected.urgencyScore !== null && (
                    <span className="meta-chip meta-chip-highlight">
                      Urgency Score: {selected.urgencyScore}/100
                    </span>
                  )}
                  {selected.onTimePercentage !== null && (
                    <span className="meta-chip">
                      Carrier Reliability: {selected.onTimePercentage}%
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="secondary-button close-details-btn"
                onClick={() => setSelectedId("")}
                aria-label="Close details"
              >
                <X size={16} />
                <span>Close Details</span>
              </button>
            </div>

            {/* Tracking Map with Prominent Styling */}
            <div className="selected-map-wrapper">
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

              {selected.recoveryRoute && (
                <div className="approved-route-banner">
                  <Navigation size={16} />
                  <span>
                    Approved Recovery Route:{" "}
                    <strong>{selected.recoveryRoute.label}</strong> (Handoff:{" "}
                    {selected.recoveryRoute.handoffMinutes}m)
                  </span>
                </div>
              )}
            </div>

            {/* Detail Grid: ETA, Events, and What-If */}
            <div className="role-dashboard-detail-grid">
              {/* ETA and Risk Card */}
              <article className="detail-card eta-card">
                <div className="detail-card-head">
                  <Clock size={18} />
                  <h3>ETA and SLA Risk</h3>
                </div>

                {etaError && (
                  <div className="form-alert" role="status">
                    <AlertTriangle size={16} />
                    <span>{etaError}</span>
                  </div>
                )}

                {selected.status !== "booked" ? (
                  <p className="tracking-muted">
                    ETA prediction becomes available once the shipment is booked.
                  </p>
                ) : eta?.status === "delivered" ? (
                  <div className="delivered-badge-large">
                    <CheckCircle2 size={24} />
                    <strong>Shipment Delivered</strong>
                  </div>
                ) : eta?.prediction ? (
                  <div className="eta-details-content">
                    <div className="eta-risk-banner">
                      <span className="eta-risk-label">Current Risk Status</span>
                      <strong
                        className={`badge badge-risk risk-${eta.prediction.risk_status
                          .toLowerCase()
                          .replaceAll(" ", "-")}`}
                      >
                        {eta.prediction.risk_status}
                      </strong>
                    </div>

                    <div className="eta-metric-row">
                      <span>Predicted Arrival</span>
                      <strong>{date(eta.prediction.estimated_arrival)}</strong>
                    </div>

                    <div className="eta-metric-row">
                      <span>Remaining Travel Time</span>
                      <strong>
                        {Math.ceil(eta.prediction.remaining_minutes)} minutes
                      </strong>
                    </div>

                    <p className="eta-explanation">
                      {eta.prediction.explanation}
                    </p>

                    {eta.locationStale && (
                      <div className="form-alert" role="alert">
                        <ShieldAlert size={16} />
                        <span>
                          Location is stale (older than 2 mins). Estimate may not
                          reflect current position.
                        </span>
                      </div>
                    )}

                    {eta.estimateBasis && (
                      <p className="tracking-muted eta-basis">
                        {eta.estimateBasis}
                      </p>
                    )}
                  </div>
                ) : !etaError ? (
                  <p className="tracking-muted">Calculating real-time ETA...</p>
                ) : null}
              </article>

              {/* Recent Tracking History Card */}
              <article className="detail-card events-card">
                <div className="detail-card-head">
                  <Navigation size={18} />
                  <h3>Recent Tracking History</h3>
                </div>

                {selected.events.length === 0 ? (
                  <p className="tracking-muted">No tracking events recorded yet.</p>
                ) : (
                  <ul className="role-dashboard-events">
                    {selected.events.map((event) => (
                      <li key={event.id} className="event-timeline-item">
                        <div className="event-dot" />
                        <div className="event-body">
                          <strong className="event-title">
                            {event.milestone
                              ? label(event.milestone)
                              : "Location update"}
                          </strong>
                          {event.message && (
                            <span className="event-msg">{event.message}</span>
                          )}
                          <small className="event-meta">
                            {date(event.occurredAt)} · Source: {event.source}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              {/* What-If Simulation Component */}
              {selected.status === "booked" &&
                selected.trackingStatus !== "delivered" && (
                  <WhatIfSimulator
                    key={selected.id}
                    shipmentId={selected.id}
                  />
                )}
            </div>

            {/* Carrier Operations Controls (for Carrier Role) */}
            {user.role === "carrier" &&
              selected.status === "booked" &&
              selected.trackingStatus !== "delivered" && (
                <section className="role-dashboard-carrier">
                  <div className="carrier-controls-head">
                    <Truck size={20} />
                    <div>
                      <h3>Record Shipment Progress</h3>
                      <p className="tracking-muted">
                        Simulated carrier updates for demonstration. Presets
                        fill coordinate fields, then save location to persist.
                      </p>
                    </div>
                  </div>

                  {message && (
                    <div className="carrier-status-alert" role="status">
                      <Info size={16} />
                      <span>{message}</span>
                    </div>
                  )}

                  {/* Milestone Progression */}
                  {nextMilestone && nextMilestone !== "booked" && (
                    <div className="carrier-milestone-bar">
                      <span className="milestone-label">Next Milestone:</span>
                      <button
                        type="button"
                        className="primary-button milestone-advance-btn"
                        disabled={saving || simulating}
                        onClick={() =>
                          void carrierUpdate({
                            eventType: "milestone",
                            milestone: nextMilestone,
                          })
                        }
                      >
                        <CheckCircle2 size={16} />
                        <span>Mark {label(nextMilestone)}</span>
                      </button>
                    </div>
                  )}

                  {/* Simulation Trigger */}
                  <div className="carrier-simulation-box">
                    <div className="simulation-btn-row">
                      {simulating ? (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={stopCarrierSimulation}
                        >
                          <Square size={16} />
                          <span>Stop Simulation</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            saving ||
                            ![
                              "picked_up",
                              "in_transit",
                              "out_for_delivery",
                            ].includes(selected.trackingStatus)
                          }
                          onClick={() => void startCarrierSimulation()}
                        >
                          <Play size={16} />
                          <span>Start Demo Simulation</span>
                        </button>
                      )}
                    </div>
                    <p className="tracking-muted simulation-note">
                      Simulates transit movement over ~40 seconds. Approved
                      recovery waypoints are followed automatically. Stop
                      simulation before reviewing transfer recovery. Delivery
                      milestones are recorded separately.
                    </p>
                  </div>

                  {/* Coordinate Presets */}
                  <div className="carrier-presets-group">
                    <span className="presets-label">Coordinate Presets:</span>
                    <div className="presets-buttons-grid">
                      <button
                        type="button"
                        className="secondary-button preset-btn"
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
                        className="secondary-button preset-btn"
                        disabled={saving || simulating}
                        onClick={() => {
                          setLatitude("18.6500");
                          setLongitude("73.6000");
                        }}
                      >
                        Demo: Approaching Lonavala
                      </button>
                      <button
                        type="button"
                        className="secondary-button preset-btn"
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
                        className="secondary-button preset-btn"
                        disabled={saving || simulating}
                        onClick={() => {
                          setLatitude("19.0760");
                          setLongitude("72.8777");
                        }}
                      >
                        Demo: Mumbai destination
                      </button>
                    </div>
                  </div>

                  {/* Manual Location Form */}
                  <form
                    className="role-dashboard-location"
                    onSubmit={submitLocation}
                  >
                    <div className="location-inputs-row">
                      <label>
                        <span>Latitude</span>
                        <input
                          type="number"
                          step="any"
                          min="-90"
                          max="90"
                          required
                          value={latitude}
                          onChange={(event) => setLatitude(event.target.value)}
                          placeholder="e.g. 18.5204"
                        />
                      </label>
                      <label>
                        <span>Longitude</span>
                        <input
                          type="number"
                          step="any"
                          min="-180"
                          max="180"
                          required
                          value={longitude}
                          onChange={(event) => setLongitude(event.target.value)}
                          placeholder="e.g. 73.8567"
                        />
                      </label>
                      <button
                        type="submit"
                        className="secondary-button location-submit-btn"
                        disabled={saving || simulating}
                      >
                        <Send size={15} />
                        <span>{saving ? "Saving..." : "Save Location"}</span>
                      </button>
                    </div>
                  </form>
                </section>
              )}
          </section>
        )}

        {/* SLA Alerts (for Shipper Role) */}
        {user.role === "shipper" && <ShipmentAlerts />}

        {/* Logistics Copilot */}
        <LogisticsCopilot
          key={`${user.id}:${selectedId || "workspace"}`}
          shipmentId={selectedId || undefined}
          shipmentLabel={selected?.trackingCode}
        />
      </div>
    </WorkspaceLayout>
  );
}
