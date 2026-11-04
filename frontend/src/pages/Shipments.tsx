
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
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import ShipmentForm from "../components/ShipmentForm";

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
  const { user, logout } = useAuth();

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [cancellingId, setCancellingId] = useState("");

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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return shipments;

    return shipments.filter((s) =>
      [
        s.trackingCode,
        s.originCity,
        s.destinationCity,
        s.cargoDescription,
        s.cargoType,
        s.status,
      ].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [shipments, search]);

  const activeCount = shipments.filter(
    (s) => s.status === "created"
  ).length;

  const cancelledCount = shipments.filter(
    (s) => s.status === "cancelled"
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

  async function handleLogout() {
    try {
      await logout();
      window.location.replace("/");
    } catch {
      setError("Unable to log out. Please try again.");
    }
  }

  return (
    <main className="dashboard-page">
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
            className="logout-button"
            onClick={handleLogout}
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      <div className="shipments-container">
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
            <XCircle size={23} />
            <span>Cancelled</span>
            <strong>{cancelledCount}</strong>
          </div>

          <div className="shipment-stat">
            <Clock3 size={23} />
            <span>Next Deadline</span>
            <strong className="stat-date">
              {earliestDeadline
                ? formatDate(
                    new Date(earliestDeadline).toISOString()
                  )
                : "—"}
            </strong>
          </div>
        </div>

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
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                />
              </div>

              <button
                className="icon-button"
                onClick={() => void load()}
                aria-label="Refresh shipments"
                title="Refresh"
              >
                <RefreshCw size={19} />
              </button>
            </div>
          </div>

          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

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
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>
                        <strong>
                          {shipment.trackingCode}
                        </strong>
                      </td>

                      <td>
                        {shipment.originCity}
                        <span className="route-arrow"> → </span>
                        {shipment.destinationCity}
                      </td>

                      <td>{shipment.cargoType}</td>

                      <td>
                        {formatDate(shipment.deadline)}
                      </td>

                      <td>
                        <span
                          className={`shipment-status ${shipment.status}`}
                        >
                          {shipment.status}
                        </span>
                      </td>

                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() =>
                              setSelected(shipment)
                            }
                          >
                            View
                          </button>

                          {shipment.status === "created" && (
                            <button
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

      {selected && (
        <div className="shipment-form-overlay">
          <section className="shipment-detail-panel">
            <div className="shipment-form-header">
              <div>
                <span className="section-eyebrow eyebrow-dark">
                  SHIPMENT DETAILS
                </span>
                <h2>{selected.trackingCode}</h2>
              </div>

              <button
                className="icon-button"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
            </div>

            <div className="shipment-detail-grid">
              <div>
                <span>Pickup</span>
                <strong>{selected.originCity}</strong>
                <p>{selected.originAddress}</p>
              </div>

              <div>
                <span>Destination</span>
                <strong>{selected.destinationCity}</strong>
                <p>{selected.destinationAddress}</p>
              </div>

              <div>
                <span>Cargo</span>
                <strong>{selected.cargoDescription}</strong>
                <p>{selected.cargoType}</p>
              </div>

              <div>
                <span>Weight</span>
                <strong>{selected.weightKg} kg</strong>
              </div>

              <div>
                <span>Delivery Deadline</span>
                <strong>{formatDate(selected.deadline)}</strong>
              </div>

              <div>
                <span>Delay Impact</span>
                <strong>
                  {formatMoney(selected.delayCostPerHour)}/hour
                </strong>
              </div>

              <div className="form-wide">
                <span>Special Instructions</span>
                <p>{selected.notes || "None"}</p>
              </div>
            </div>

            <div className="shipment-form-actions">
              <button
                className="secondary-button"
                onClick={() => setSelected(null)}
              >
                Close
              </button>

              {selected.status === "created" && (
                <button
                  className="danger-button"
                  disabled={cancellingId === selected.id}
                  onClick={() =>
                    void handleCancel(selected)
                  }
                >
                  {cancellingId
                    ? "Cancelling..."
                    : "Cancel Shipment"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
