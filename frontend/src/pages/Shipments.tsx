
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  Truck,
  Plus,
  Search,
  Package,
  Clock3,
  CheckCircle2,
  XCircle,
  Pencil,
  LogOut,
  RefreshCw,
  ReceiptText,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import ShipmentForm from "../components/ShipmentForm";
import CarrierComparison from "../components/CarrierComparison";
import PricingBooking from "../components/PricingBooking";
import BookingSummary from "../components/BookingSummary";

import {
  listShipments,
  createShipment,
  updateShipment,
  cancelShipment,
  type Shipment,
  type ShipmentInput,
} from "../lib/shipments";

// ========================================
// FORMATTING HELPERS
// ========================================

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

// ========================================
// SHIPPER DASHBOARD
// ========================================

export default function Shipments() {
  const { user, logout } = useAuth();

  // ========================================
  // STATE
  // ========================================

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [editing, setEditing] =
    useState<Shipment | null>(null);

  const [selected, setSelected] =
    useState<Shipment | null>(null);

  const [comparingShipment, setComparingShipment] =
    useState<Shipment | null>(null);

  const [pricingShipment, setPricingShipment] =
    useState<Shipment | null>(null);

  const [cancellingId, setCancellingId] = useState("");

  // Always use the latest loaded shipment
  // when displaying its details.

  const selectedShipment = selected
    ? shipments.find(
        (shipment) => shipment.id === selected.id
      ) ?? selected
    : null;

  // ========================================
  // FETCH SHIPMENTS
  // ========================================

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await listShipments();

      setShipments(data.shipments);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load shipments"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ========================================
  // SEARCH AND SORTING
  // ========================================

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
      ].some((value) =>
        value.toLowerCase().includes(query)
      );
    });

    const statusOrder = {
      created: 0,
      booked: 1,
      cancelled: 2,
    };

    return [...matches].sort((a, b) => {
      if (a.status !== b.status) {
        return (
          statusOrder[a.status] -
          statusOrder[b.status]
        );
      }

      if (a.urgency.score !== b.urgency.score) {
        return (
          b.urgency.score -
          a.urgency.score
        );
      }

      return (
        new Date(a.deadline).getTime() -
        new Date(b.deadline).getTime()
      );
    });
  }, [shipments, search]);

  // ========================================
  // DASHBOARD STATISTICS
  // ========================================

  const activeCount = shipments.filter(
    (shipment) => shipment.status === "created"
  ).length;

  const bookedCount = shipments.filter(
    (shipment) => shipment.status === "booked"
  ).length;

  const cancelledCount = shipments.filter(
    (shipment) => shipment.status === "cancelled"
  ).length;

  const criticalCount = shipments.filter(
    (shipment) =>
      shipment.status === "created" &&
      shipment.urgency.level === "Critical"
  ).length;

  const highCount = shipments.filter(
    (shipment) =>
      shipment.status === "created" &&
      shipment.urgency.level === "High"
  ).length;

  const earliestDeadline = shipments
    .filter(
      (shipment) => shipment.status === "created"
    )
    .map((shipment) =>
      new Date(shipment.deadline).getTime()
    )
    .sort((a, b) => a - b)[0];

  // ========================================
  // CREATE / UPDATE SHIPMENT
  // ========================================

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

  // ========================================
  // CANCEL SHIPMENT
  // ========================================

  async function handleCancel(shipment: Shipment) {
    if (shipment.status !== "created") {
      setError(
        "Only unbooked shipments can be cancelled."
      );
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
        err instanceof Error
          ? err.message
          : "Unable to cancel shipment"
      );
    } finally {
      setCancellingId("");
    }
  }

  // ========================================
  // LOGOUT
  // ========================================

  async function handleLogout() {
    try {
      await logout();

      window.location.replace("/");
    } catch {
      setError(
        "Unable to log out. Please try again."
      );
    }
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <main className="dashboard-page">

      {/* ====================================
          HEADER
          ==================================== */}

      <header className="dashboard-header">
        <Link className="brand" to="/">
          <span className="brand-mark">
            <Truck size={21} />
          </span>

          SwiftChain
        </Link>

        <div className="shipment-header-actions">
          <span className="shipment-account">
            {user?.fullName}
          </span>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      {/* ====================================
          DASHBOARD CONTENT
          ==================================== */}

      <div className="shipments-container">

        {/* PAGE HEADING */}

        <div className="shipments-heading">
          <div>
            <span className="section-eyebrow eyebrow-dark">
              SHIPPER WORKSPACE
            </span>

            <h1>Shipment Management</h1>

            <p>
              Create, monitor, and manage your
              time-critical shipment requests.
            </p>
          </div>

          <button
            type="button"
            className="primary-button create-button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus size={19} />
            New Shipment
          </button>
        </div>

        {/* ====================================
            STATISTICS
            ==================================== */}

        <div className="shipment-stats">

          <div className="shipment-stat">
            <Package size={23} />
            <span>Total Shipments</span>
            <strong>{shipments.length}</strong>
          </div>

          <div className="shipment-stat">
            <CheckCircle2 size={23} />
            <span>Created Requests</span>
            <strong>{activeCount}</strong>
          </div>

          <div className="shipment-stat">
            <CheckCircle2 size={23} />
            <span>Booked Shipments</span>
            <strong>{bookedCount}</strong>
          </div>

          <div className="shipment-stat">
            <Clock3 size={23} />
            <span>Critical Urgency</span>
            <strong>{criticalCount}</strong>
          </div>

          <div className="shipment-stat">
            <Clock3 size={23} />
            <span>High Urgency</span>
            <strong>{highCount}</strong>
          </div>

          <div className="shipment-stat">
            <XCircle size={23} />
            <span>Cancelled</span>
            <strong>{cancelledCount}</strong>
          </div>

          <div className="shipment-stat">
            <Clock3 size={23} />
            <span>Next Deadline</span>

            <strong className="stat-date">
              {earliestDeadline !== undefined
                ? formatDate(
                    new Date(
                      earliestDeadline
                    ).toISOString()
                  )
                : "—"}
            </strong>
          </div>

        </div>

        {/* ====================================
            SHIPMENT TABLE
            ==================================== */}

        <section className="shipment-list-card">

          <div className="shipment-list-top">
            <div>
              <h2>Your Shipments</h2>
              <p>Saved shipment requests</p>
            </div>

            <div className="shipment-tools">

              <div className="shipment-search">
                <Search size={18} />

                <input
                  type="search"
                  aria-label="Search shipments"
                  placeholder="Search shipments..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                />
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => void load()}
                aria-label="Refresh shipments"
                title="Refresh"
              >
                <RefreshCw size={19} />
              </button>

            </div>
          </div>

          {/* ERRORS */}

          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

          {/* LOADING / EMPTY / DATA */}

          {loading ? (
            <div className="shipments-empty">
              Loading shipments...
            </div>
          ) : filtered.length === 0 ? (
            <div className="shipments-empty">
              <Package size={35} />

              <h3>
                {search
                  ? "No matching shipments"
                  : "No shipments created yet"}
              </h3>

              <p>
                {search
                  ? "Try a different search."
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
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((shipment) => (
                    <tr key={shipment.id}>

                      {/* TRACKING CODE */}

                      <td>
                        <strong>
                          {shipment.trackingCode}
                        </strong>
                      </td>

                      {/* ROUTE */}

                      <td>
                        {shipment.originCity}

                        <span className="route-arrow">
                          {" "}→{" "}
                        </span>

                        {shipment.destinationCity}
                      </td>

                      {/* CARGO */}

                      <td>
                        {shipment.cargoType}
                      </td>

                      {/* DEADLINE */}

                      <td>
                        {formatDate(
                          shipment.deadline
                        )}
                      </td>

                      {/* URGENCY */}

                      <td>
                        {shipment.status === "cancelled" ? (
                          <span className="urgency-muted">
                            Not active
                          </span>
                        ) : (
                          <div className="urgency-cell">

                            <span
                              className={
                                `urgency-badge urgency-${shipment.urgency.level.toLowerCase()}`
                              }
                            >
                              {shipment.urgency.level}
                            </span>

                            <strong className="urgency-number">
                              {shipment.urgency.score}/100
                            </strong>

                          </div>
                        )}
                      </td>

                      {/* STATUS */}

                      <td>
                        <span
                          className={
                            `shipment-status ${shipment.status}`
                          }
                        >
                          {shipment.status}
                        </span>
                      </td>

                      {/* ACTIONS */}

                      <td>
                        <div className="table-actions">

                          {/* VIEW */}

                          <button
                            type="button"
                            onClick={() =>
                              setSelected(shipment)
                            }
                          >
                            View
                          </button>

                          {/* COMPARE CARRIERS */}

                          {shipment.status === "created" && (
                            <button
                              type="button"
                              onClick={() =>
                                setComparingShipment(
                                  shipment
                                )
                              }
                            >
                              <Truck size={14} />
                              Compare Carriers
                            </button>
                          )}

                          {/* GET QUOTE */}

                          {shipment.status === "created" && (
                            <button
                              type="button"
                              onClick={() =>
                                setPricingShipment(
                                  shipment
                                )
                              }
                            >
                              <ReceiptText size={14} />
                              Get Quote
                            </button>
                          )}

                          {/* EDIT */}

                          {shipment.status === "created" && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(shipment);
                                setShowForm(true);
                              }}
                            >
                              <Pencil size={14} />
                              Edit
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

      {/* ====================================
          CREATE / EDIT MODAL
          ==================================== */}

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

      {/* ====================================
          VIEW SHIPMENT MODAL
          ==================================== */}

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

            {/* SHIPMENT DETAILS */}

            <div className="shipment-detail-grid">

              <div>
                <span>Pickup</span>

                <strong>
                  {selectedShipment.originCity}
                </strong>

                <p>
                  {selectedShipment.originAddress}
                </p>
              </div>

              <div>
                <span>Destination</span>

                <strong>
                  {selectedShipment.destinationCity}
                </strong>

                <p>
                  {selectedShipment.destinationAddress}
                </p>
              </div>

              <div>
                <span>Cargo</span>

                <strong>
                  {selectedShipment.cargoDescription}
                </strong>

                <p>
                  {selectedShipment.cargoType}
                </p>
              </div>

              <div>
                <span>Weight</span>

                <strong>
                  {selectedShipment.weightKg} kg
                </strong>
              </div>

              <div>
                <span>Delivery Deadline</span>

                <strong>
                  {formatDate(
                    selectedShipment.deadline
                  )}
                </strong>
              </div>

              <div>
                <span>Delay Impact</span>

                <strong>
                  {formatMoney(
                    selectedShipment.delayCostPerHour
                  )}/hour
                </strong>
              </div>

              {/* ====================================
                  URGENCY ASSESSMENT
                  ==================================== */}

              <div className="form-wide urgency-detail-card">
                <span>URGENCY ASSESSMENT</span>

                {selectedShipment.status === "cancelled" ? (
                  <p>
                    This shipment has been cancelled.
                  </p>
                ) : (
                  <>
                    <div className="urgency-detail-head">

                      <strong>
                        {selectedShipment.urgency.score}/100
                      </strong>

                      <span
                        className={
                          `urgency-badge urgency-${selectedShipment.urgency.level.toLowerCase()}`
                        }
                      >
                        {selectedShipment.urgency.level}
                      </span>

                    </div>

                    {/* URGENCY PROGRESS BAR */}

                    <div className="urgency-progress">
                      <div
                        style={{
                          width:
                            `${selectedShipment.urgency.score}%`,
                        }}
                      />
                    </div>

                    {/* URGENCY BREAKDOWN */}

                    <div className="urgency-breakdown">

                      <p>
                        <strong>
                          Deadline:
                        </strong>{" "}
                        {
                          selectedShipment.urgency.breakdown
                            .deadlineScore
                        }/100
                      </p>

                      <p>
                        <strong>
                          Business impact:
                        </strong>{" "}
                        {
                          selectedShipment.urgency.breakdown
                            .impactScore
                        }/100
                      </p>

                      <p>
                        <strong>
                          Cargo criticality:
                        </strong>{" "}
                        {
                          selectedShipment.urgency.breakdown
                            .cargoScore
                        }/100
                      </p>

                      <p>
                        <strong>
                          Time remaining:
                        </strong>{" "}
                        {
                          selectedShipment.urgency.breakdown
                            .isOverdue
                            ? "Deadline passed"
                            : `${selectedShipment.urgency.breakdown.hoursRemaining} hours`
                        }
                      </p>

                    </div>

                    <p className="urgency-explanation">
                      The score combines deadline pressure,
                      business impact, and cargo criticality.
                      It is recalculated whenever shipment
                      data is requested.
                    </p>
                  </>
                )}
              </div>

              {/* SPECIAL INSTRUCTIONS */}

              <div className="form-wide">
                <span>Special Instructions</span>

                <p>
                  {selectedShipment.notes || "None"}
                </p>
              </div>

            </div>

            {/* ====================================
                CONFIRMED BOOKING
                ==================================== */}

            {selectedShipment.status === "booked" && (
              <BookingSummary
                shipmentId={selectedShipment.id}
              />
            )}

            {/* ====================================
                MODAL ACTIONS
                ==================================== */}

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
                  disabled={
                    cancellingId === selectedShipment.id
                  }
                  onClick={() =>
                    void handleCancel(
                      selectedShipment
                    )
                  }
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

      {/* ====================================
          CARRIER COMPARISON
          ==================================== */}

      {comparingShipment && (
        <CarrierComparison
          shipment={comparingShipment}
          onClose={() =>
            setComparingShipment(null)
          }
        />
      )}

      {/* ====================================
          PRICING AND BOOKING
          ==================================== */}

      {pricingShipment && (
        <PricingBooking
          shipment={pricingShipment}
          onClose={() =>
            setPricingShipment(null)
          }
          onBooked={load}
        />
      )}

    </main>
  );
}
