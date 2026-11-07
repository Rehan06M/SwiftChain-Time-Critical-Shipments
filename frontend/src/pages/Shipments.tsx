import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Truck,
  Plus,
  Search,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
  RefreshCw,
  ReceiptText,
  X,
  Eye,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

import WorkspaceLayout from "../components/WorkspaceLayout";
import ShipmentForm from "../components/ShipmentForm";
import CarrierComparison from "../components/CarrierComparison";
import PricingBooking from "../components/PricingBooking";
import BookingSummary from "../components/BookingSummary";
import ShipmentTracking from "../components/ShipmentTracking";
import ShipmentAlerts from "../components/ShipmentAlerts";
import DispatcherAssignment from "../components/DispatcherAssignment";

import {
  listShipments,
  createShipment,
  updateShipment,
  cancelShipment,
  type Shipment,
  type ShipmentInput,
} from "../lib/shipments";

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [comparingShipment, setComparingShipment] =
    useState<Shipment | null>(null);
  const [pricingShipment, setPricingShipment] =
    useState<Shipment | null>(null);
  const [cancellingId, setCancellingId] = useState("");

  const selectedShipment = selected
    ? shipments.find((s) => s.id === selected.id) ?? selected
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await listShipments();
      setShipments(data.shipments);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load shipments"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matches = shipments.filter((shipment) => {
      if (!query) return true;
      return [
        shipment.trackingCode,
        shipment.originCity,
        shipment.destinationCity,
        shipment.cargoDescription,
        shipment.cargoType,
        shipment.status,
        shipment.urgency.level,
      ].some((value) => value.toLowerCase().includes(query));
    });

    const statusOrder: Record<string, number> = {
      created: 0,
      booked: 1,
      cancelled: 2,
    };

    return [...matches].sort((a, b) => {
      if (a.status !== b.status) {
        return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      }
      if (a.urgency.score !== b.urgency.score) {
        return b.urgency.score - a.urgency.score;
      }
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
  }, [shipments, search]);

  const activeCount = shipments.filter((s) => s.status === "created").length;
  const bookedCount = shipments.filter((s) => s.status === "booked").length;
  const cancelledCount = shipments.filter((s) => s.status === "cancelled").length;
  const criticalCount = shipments.filter(
    (s) => s.status === "created" && s.urgency.level === "Critical"
  ).length;
  const highCount = shipments.filter(
    (s) => s.status === "created" && s.urgency.level === "High"
  ).length;

  const earliestDeadline = shipments
    .filter((s) => s.status === "created")
    .map((s) => new Date(s.deadline).getTime())
    .sort((a, b) => a - b)[0];

  async function save(input: ShipmentInput) {
    if (editing) {
      await updateShipment(editing.id, input);
    } else {
      await createShipment(input);
    }

    setShowForm(false);
    setEditing(null);
    await load();
  }

  async function handleCancel(shipment: Shipment) {
    if (shipment.status !== "created") {
      setError("Only unbooked shipments can be cancelled.");
      return;
    }

    const confirmed = window.confirm(
      `Cancel shipment ${shipment.trackingCode}?`
    );
    if (!confirmed) return;

    setCancellingId(shipment.id);
    setError("");

    try {
      await cancelShipment(shipment.id);
      setSelected(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to cancel shipment"
      );
    } finally {
      setCancellingId("");
    }
  }

  return (
    <WorkspaceLayout
      pageTitle="Shipment Management"
      pageSubtitle="Create, monitor, and manage your time-critical shipment requests."
      pageEyebrow="SHIPPER WORKSPACE"
      headerActions={
        <button
          type="button"
          className="primary-button new-shipment-header-btn"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus size={16} />
          <span>New Shipment</span>
        </button>
      }
    >
      <div className="shipments-container">
        {/* Alerts panel */}
        <ShipmentAlerts />

        {/* Dashboard Statistics Grid */}
        <div className="shipment-stats">
          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-neutral">
              <Package size={20} />
            </div>
            <div className="stat-body">
              <span>Total Shipments</span>
              <strong>{shipments.length}</strong>
            </div>
          </div>

          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-info">
              <CheckCircle2 size={20} />
            </div>
            <div className="stat-body">
              <span>Created Requests</span>
              <strong>{activeCount}</strong>
            </div>
          </div>

          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-success">
              <Truck size={20} />
            </div>
            <div className="stat-body">
              <span>Booked Shipments</span>
              <strong>{bookedCount}</strong>
            </div>
          </div>

          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-danger">
              <AlertTriangle size={20} />
            </div>
            <div className="stat-body">
              <span>Critical Urgency</span>
              <strong>{criticalCount}</strong>
            </div>
          </div>

          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-warning">
              <Clock size={20} />
            </div>
            <div className="stat-body">
              <span>High Urgency</span>
              <strong>{highCount}</strong>
            </div>
          </div>

          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-cancelled">
              <XCircle size={20} />
            </div>
            <div className="stat-body">
              <span>Cancelled</span>
              <strong>{cancelledCount}</strong>
            </div>
          </div>

          <div className="shipment-stat">
            <div className="stat-icon-wrap stat-icon-deadline">
              <Clock size={20} />
            </div>
            <div className="stat-body">
              <span>Next Deadline</span>
              <strong className="stat-date">
                {earliestDeadline !== undefined
                  ? formatDate(new Date(earliestDeadline).toISOString())
                  : "—"}
              </strong>
            </div>
          </div>
        </div>

        {/* Shipment Table Card */}
        <section className="shipment-list-card">
          <div className="shipment-list-top">
            <div>
              <h2>Your Shipments</h2>
              <p className="tracking-muted">
                Saved shipment requests and real-time status
              </p>
            </div>

            <div className="shipment-tools">
              <div className="shipment-search">
                <Search size={16} className="search-icon" />
                <input
                  type="search"
                  aria-label="Search shipments"
                  placeholder="Search tracking ID, city, cargo..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => void load()}
                aria-label="Refresh shipments"
                title="Refresh"
              >
                <RefreshCw size={15} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Errors */}
          {error && (
            <div className="form-alert" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Loading / Empty / Data */}
          {loading ? (
            <div className="shipments-empty">
              <RefreshCw size={24} className="spin-icon" />
              <span>Loading shipments...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="shipments-empty">
              <Package size={36} />
              <h3>
                {search ? "No matching shipments" : "No shipments created yet"}
              </h3>
              <p>
                {search
                  ? "Try adjusting your search criteria."
                  : "Create your first urgent shipment to get started."}
              </p>
            </div>
          ) : (
            <div className="shipment-table-scroll">
              <table className="shipment-table">
                <thead>
                  <tr>
                    <th>Shipment ID</th>
                    <th>Route</th>
                    <th>Cargo</th>
                    <th>Deadline</th>
                    <th>Urgency</th>
                    <th>Status</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((shipment) => (
                    <tr key={shipment.id}>
                      <td className="td-tracking">
                        <strong>{shipment.trackingCode}</strong>
                      </td>
                      <td className="td-route">
                        <span className="route-text">
                          {shipment.originCity}
                          <ArrowRight size={13} className="route-arrow-icon" />
                          {shipment.destinationCity}
                        </span>
                      </td>
                      <td>
                        <span className="cargo-tag">{shipment.cargoType}</span>
                      </td>
                      <td className="td-date">{formatDate(shipment.deadline)}</td>
                      <td>
                        {shipment.status === "cancelled" ? (
                          <span className="urgency-muted">Not active</span>
                        ) : (
                          <div className="urgency-cell">
                            <span
                              className={`urgency-badge urgency-${shipment.urgency.level.toLowerCase()}`}
                            >
                              {shipment.urgency.level}
                            </span>
                            <strong className="urgency-number">
                              {shipment.urgency.score}/100
                            </strong>
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`shipment-status status-${shipment.status}`}
                        >
                          {shipment.status}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="secondary-button btn-xs"
                            onClick={() => setSelected(shipment)}
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>

                          {shipment.status === "created" && (
                            <button
                              type="button"
                              className="secondary-button btn-xs"
                              onClick={() => setComparingShipment(shipment)}
                            >
                              <Truck size={13} />
                              <span>Compare</span>
                            </button>
                          )}

                          {shipment.status === "created" && (
                            <button
                              type="button"
                              className="primary-button btn-xs"
                              onClick={() => setPricingShipment(shipment)}
                            >
                              <ReceiptText size={13} />
                              <span>Get Quote</span>
                            </button>
                          )}

                          {shipment.status === "created" && (
                            <button
                              type="button"
                              className="secondary-button btn-xs"
                              onClick={() => {
                                setEditing(shipment);
                                setShowForm(true);
                              }}
                            >
                              <Pencil size={13} />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* CREATE / EDIT MODAL */}
      {showForm && (
        <ShipmentForm
          key={editing?.id ?? "new"}
          shipment={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}

      {/* VIEW SHIPMENT MODAL */}
      {selectedShipment && (
        <div className="shipment-form-overlay">
          <section
            className="shipment-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-details-title"
          >
            <div className="shipment-form-header">
              <div>
                <span className="section-eyebrow eyebrow-dark">
                  SHIPMENT DETAILS
                </span>
                <h2 id="shipment-details-title">
                  {selectedShipment.trackingCode}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close shipment details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="shipment-detail-grid">
              <div className="detail-item">
                <span className="detail-label">Pickup</span>
                <strong className="detail-city">
                  {selectedShipment.originCity}
                </strong>
                <p className="detail-addr">{selectedShipment.originAddress}</p>
              </div>

              <div className="detail-item">
                <span className="detail-label">Destination</span>
                <strong className="detail-city">
                  {selectedShipment.destinationCity}
                </strong>
                <p className="detail-addr">
                  {selectedShipment.destinationAddress}
                </p>
              </div>

              <div className="detail-item">
                <span className="detail-label">Cargo</span>
                <strong className="detail-city">
                  {selectedShipment.cargoDescription}
                </strong>
                <p className="detail-addr">{selectedShipment.cargoType}</p>
              </div>

              <div className="detail-item">
                <span className="detail-label">Weight</span>
                <strong className="detail-city">
                  {selectedShipment.weightKg} kg
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">Delivery Deadline</span>
                <strong className="detail-city">
                  {formatDate(selectedShipment.deadline)}
                </strong>
              </div>

              <div className="detail-item">
                <span className="detail-label">Delay Impact</span>
                <strong className="detail-city">
                  {formatMoney(selectedShipment.delayCostPerHour)}/hour
                </strong>
              </div>

              {/* URGENCY ASSESSMENT */}
              <div className="form-wide urgency-detail-card">
                <span className="urgency-card-title">URGENCY ASSESSMENT</span>

                {selectedShipment.status === "cancelled" ? (
                  <p className="tracking-muted">
                    This shipment has been cancelled.
                  </p>
                ) : (
                  <>
                    <div className="urgency-detail-head">
                      <strong className="urgency-big-number">
                        {selectedShipment.urgency.score}/100
                      </strong>
                      <span
                        className={`urgency-badge urgency-${selectedShipment.urgency.level.toLowerCase()}`}
                      >
                        {selectedShipment.urgency.level}
                      </span>
                    </div>

                    <div className="urgency-progress">
                      <div
                        className="urgency-progress-bar"
                        style={{
                          width: `${selectedShipment.urgency.score}%`,
                        }}
                      />
                    </div>

                    <div className="urgency-breakdown">
                      <p>
                        <strong>Deadline Score:</strong>{" "}
                        {selectedShipment.urgency.breakdown.deadlineScore}/100
                      </p>
                      <p>
                        <strong>Business Impact:</strong>{" "}
                        {selectedShipment.urgency.breakdown.impactScore}/100
                      </p>
                      <p>
                        <strong>Cargo Criticality:</strong>{" "}
                        {selectedShipment.urgency.breakdown.cargoScore}/100
                      </p>
                      <p>
                        <strong>Time Remaining:</strong>{" "}
                        {selectedShipment.urgency.breakdown.isOverdue
                          ? "Deadline passed"
                          : `${selectedShipment.urgency.breakdown.hoursRemaining} hours`}
                      </p>
                    </div>

                    <p className="urgency-explanation">
                      The score combines deadline pressure, business impact, and
                      cargo criticality. It is recalculated whenever shipment
                      data is requested.
                    </p>
                  </>
                )}
              </div>

              {/* SPECIAL INSTRUCTIONS */}
              <div className="form-wide special-notes-card">
                <span className="detail-label">Special Instructions</span>
                <p>{selectedShipment.notes || "None specified"}</p>
              </div>
            </div>

            {/* CONFIRMED BOOKING */}
            {selectedShipment.status === "booked" && (
              <BookingSummary shipmentId={selectedShipment.id} />
            )}

            {selectedShipment.status === "booked" && (
              <ShipmentTracking
                key={selectedShipment.id}
                shipmentId={selectedShipment.id}
              />
            )}

            {selectedShipment.status === "booked" && (
              <DispatcherAssignment
                key={`dispatcher-${selectedShipment.id}`}
                shipmentId={selectedShipment.id}
              />
            )}

            {/* MODAL ACTIONS */}
            <div className="shipment-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelected(null)}
              >
                Close
              </button>

              {selectedShipment.status === "created" && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={cancellingId === selectedShipment.id}
                  onClick={() => void handleCancel(selectedShipment)}
                >
                  {cancellingId === selectedShipment.id
                    ? "Cancelling..."
                    : "Cancel Shipment"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* CARRIER COMPARISON */}
      {comparingShipment && (
        <CarrierComparison
          shipment={comparingShipment}
          onClose={() => setComparingShipment(null)}
        />
      )}

      {/* PRICING AND BOOKING */}
      {pricingShipment && (
        <PricingBooking
          shipment={pricingShipment}
          onClose={() => setPricingShipment(null)}
          onBooked={load}
        />
      )}
    </WorkspaceLayout>
  );
}
