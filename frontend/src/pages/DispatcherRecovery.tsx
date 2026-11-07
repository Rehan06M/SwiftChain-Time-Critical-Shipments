import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import TransitRecovery from "../components/TransitRecovery";
import WorkspaceLayout from "../components/WorkspaceLayout";
import {
  RotateCcw,
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Info,
} from "lucide-react";

interface AssignedShipment {
  id: string;
  trackingCode: string;
  originCity: string;
  destinationCity: string;
  deadline: string;
  riskStatus: string | null;
  status: string;
  trackingStatus: string;
  locationRecordedAt: string | null;
}

interface Proposal {
  id: string;
  carrierName: string;
  transportMode: string;
  estimatedArrival: string;
  timeSavedMinutes: number;
  additionalCostInr: number;
  meetsDeadline: boolean;
  expiresAt: string;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(value);

const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function DispatcherRecovery() {
  const [shipments, setShipments] = useState<AssignedShipment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await apiRequest<{
      shipments: AssignedShipment[];
    }>("/workspace", {
      signal,
      cache: "no-store",
    });

    if (!signal?.aborted) {
      setShipments(
        data.shipments.filter(
          (shipment) =>
            shipment.status === "booked" &&
            shipment.trackingStatus !== "delivered"
        )
      );
    }
  }, []);


  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => {
      if (controller.signal.aborted) return;

      void load(controller.signal).catch((err) => {
        if (!controller.signal.aborted) {
          setMessage(
            err instanceof Error
              ? err.message
              : "Unable to load shipments"
          );
        }
      });
    });

    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function generate(shipmentId: string) {
    setBusy(true);
    setSelectedId(shipmentId);
    setProposals([]);
    setMessage("");

    try {
      const data = await apiRequest<{
        proposals: Proposal[];
        message: string;
      }>(`/recovery/${shipmentId}/recommendations`, {
        method: "POST",
      });

      setProposals(data.proposals);
      setMessage(data.message);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Unable to generate options"
      );
    } finally {
      setBusy(false);
    }
  }

  async function approve(proposal: Proposal) {
    const confirmed = window.confirm(
      `Approve ${proposal.carrierName} for an additional ` +
      `${money(proposal.additionalCostInr)}? ` +
      "The original booking is not refunded."
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<{
        message: string;
        estimatedArrival: string;
      }>(`/recovery/proposals/${proposal.id}/approve`, {
        method: "POST",
      });

      setProposals([]);
      setMessage(
        `${result.message}. New estimated arrival: ` + date(result.estimatedArrival)
      );

      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  const selected = shipments.find((s) => s.id === selectedId);

  const beforePickupShipments = shipments.filter(
    (s) => s.trackingStatus === "booked" && s.locationRecordedAt === null
  );

  const transitShipments = shipments.filter(
    (s) => s.trackingStatus === "picked_up" || s.trackingStatus === "in_transit"
  );

  return (
    <WorkspaceLayout
      pageTitle="Shipment Recovery"
      pageSubtitle="Review before-pickup alternatives or configured transfer routes for moving shipments. Replacement costs are additional; original bookings are not refunded."
      pageEyebrow="DISPATCHER WORKSPACE"
      headerActions={
        <button
          type="button"
          className="workspace-action-btn"
          disabled={busy}
          onClick={() => {
            void load().catch((err) => {
              setMessage(
                err instanceof Error ? err.message : "Refresh failed"
              );
            });
          }}
        >
          <RefreshCw size={15} />
          <span>Refresh Shipments</span>
        </button>
      }
    >
      <div className="recovery-page-container">
        {message && (
          <div className="form-alert recovery-alert-banner" role="status">
            <Info size={16} />
            <span>{message}</span>
          </div>
        )}

        <div className="recovery-notice-box">
          <ShieldAlert size={18} />
          <div className="notice-content">
            <strong>Important Operational Notice</strong>
            <p>
              Recovery options recalculate route feasibility using live telemetry.
              Original booking costs are committed and non-refundable. Before
              evaluating in-transit transfers, carrier location simulation must be
              paused.
            </p>
          </div>
        </div>

        {shipments.length === 0 && (
          <div className="recovery-empty-card">
            <CheckCircle2 size={36} />
            <h3>No Active Assigned Shipments</h3>
            <p className="tracking-muted">
              All assigned shipments are either delivered or have not yet been
              booked.
            </p>
          </div>
        )}

        {/* SECTION 1: BEFORE-PICKUP RECOVERY */}
        <section className="recovery-section-card">
          <div className="recovery-section-header">
            <div className="section-title-wrap">
              <span className="section-tag tag-orange">STAGE 1</span>
              <h2>Before-Pickup Recovery</h2>
            </div>
            <p className="tracking-muted">
              Carrier replacements for booked shipments prior to pickup or
              recorded location movement.
            </p>
          </div>

          {beforePickupShipments.length === 0 ? (
            <div className="recovery-sub-empty">
              <Info size={18} />
              <span>
                No assigned shipments currently qualify for before-pickup recovery.
              </span>
            </div>
          ) : (
            <div className="recovery-candidates-grid">
              {beforePickupShipments.map((shipment) => {
                const isSelected = selectedId === shipment.id;
                return (
                  <article
                    className={`recovery-shipment-card ${isSelected ? "is-selected-candidate" : ""
                      }`}
                    key={shipment.id}
                  >
                    <div className="candidate-head">
                      <strong className="candidate-code">
                        {shipment.trackingCode}
                      </strong>
                      <span className="badge badge-progress progress-booked">
                        Booked (Pre-Pickup)
                      </span>
                    </div>

                    <div className="candidate-route">
                      <span>{shipment.originCity}</span>
                      <ArrowRight size={13} className="route-arrow-icon" />
                      <span>{shipment.destinationCity}</span>
                    </div>

                    <div className="candidate-meta">
                      <div className="meta-row">
                        <Clock size={14} />
                        <span>Deadline: {date(shipment.deadline)}</span>
                      </div>
                      <div className="meta-row">
                        <AlertTriangle size={14} />
                        <span>
                          Monitored Risk:{" "}
                          <strong>
                            {shipment.riskStatus ?? "Not assessed"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="primary-button candidate-action-btn"
                      disabled={busy}
                      onClick={() => void generate(shipment.id)}
                    >
                      <RotateCcw size={15} />
                      <span>
                        {busy && selectedId === shipment.id
                          ? "Generating Alternatives..."
                          : "Find Before-Pickup Alternatives"}
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {/* Before-pickup proposals */}
          {selected && proposals.length > 0 && (
            <div className="recovery-proposals-panel">
              <div className="proposals-header">
                <h3>Recovery Options for {selected.trackingCode}</h3>
                <span className="proposals-count">
                  {proposals.length} available{" "}
                  {proposals.length === 1 ? "option" : "options"}
                </span>
              </div>

              <div className="proposals-grid">
                {proposals.map((proposal) => {
                  const expired =
                    new Date(proposal.expiresAt).getTime() <= now;

                  return (
                    <article className="proposal-card" key={proposal.id}>
                      <div className="proposal-card-head">
                        <div>
                          <span className="proposal-carrier-name">
                            {proposal.carrierName}
                          </span>
                          <span className="proposal-mode">
                            Mode: {proposal.transportMode.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div
                          className={`proposal-badge ${proposal.meetsDeadline
                            ? "badge-feasible"
                            : "badge-infeasible"
                            }`}
                        >
                          {proposal.meetsDeadline ? (
                            <CheckCircle2 size={13} />
                          ) : (
                            <AlertTriangle size={13} />
                          )}
                          <span>
                            {proposal.meetsDeadline
                              ? "Meets Deadline"
                              : "Misses Deadline"}
                          </span>
                        </div>
                      </div>

                      <div className="proposal-metrics">
                        <div className="prop-metric">
                          <span className="prop-label">Estimated Arrival</span>
                          <strong className="prop-val">
                            {date(proposal.estimatedArrival)}
                          </strong>
                        </div>

                        <div className="prop-metric">
                          <span className="prop-label">Time Saved</span>
                          <strong className="prop-val val-highlight">
                            {proposal.timeSavedMinutes} minutes
                          </strong>
                        </div>

                        <div className="prop-metric">
                          <span className="prop-label">Additional Charge</span>
                          <strong className="prop-val val-cost">
                            {money(proposal.additionalCostInr)}
                          </strong>
                        </div>
                      </div>

                      <div className="proposal-footer">
                        <span className="expiry-hint">
                          {expired
                            ? "Expired — regenerate options"
                            : `Expires ${new Date(
                              proposal.expiresAt
                            ).toLocaleTimeString("en-IN")}`}
                        </span>

                        <button
                          type="button"
                          className="primary-button approve-btn"
                          disabled={busy || expired}
                          onClick={() => void approve(proposal)}
                        >
                          <CheckCircle2 size={15} />
                          <span>Approve Recovery</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* SECTION 2: IN-TRANSIT TRANSFER RECOVERY */}
        <section className="recovery-section-card">
          <div className="recovery-section-header">
            <div className="section-title-wrap">
              <span className="section-tag tag-blue">STAGE 2</span>
              <h2>In-Transit Transfer Recovery</h2>
            </div>
            <p className="tracking-muted">
              Configure intermediate hub transfers for shipments actively Picked
              Up or In Transit. Out for Delivery and Delivered shipments do not
              qualify.
            </p>
          </div>


          <TransitRecovery
            shipments={transitShipments}
            onApproved={() => {
              void load().catch((err) => {
                setMessage(
                  "Recovery was approved, but the shipment list could not " +
                  "refresh. Please use Refresh shipments. " +
                  (err instanceof Error ? err.message : "")
                );
              });
            }}
          />
        </section>
      </div>
    </WorkspaceLayout>
  );
}
