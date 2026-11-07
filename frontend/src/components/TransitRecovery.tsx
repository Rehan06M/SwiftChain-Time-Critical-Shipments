import { useState } from "react";
import { apiRequest } from "../lib/api";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Navigation,
} from "lucide-react";

interface Shipment {
  id: string;
  trackingCode: string;
}

interface Proposal {
  id: string;
  carrierName: string;
  transportMode: string;
  transferPoint: string;
  routeName: string;
  approachMinutes: number;
  handoffMinutes: number;
  handoffCostInr: number;
  serviceCostInr: number;
  additionalCostInr: number;
  timeSavedMinutes: number;
  estimatedArrival: string;
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

export default function TransitRecovery({
  shipments,
}: {
  shipments: Shipment[];
}) {
  const [selected, setSelected] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!selected) return;

    setBusy(true);
    setMessage("");
    setProposals([]);

    try {
      const result = await apiRequest<{
        proposals: Proposal[];
        message: string;
      }>(`/transit-recovery/${selected}/recommendations`, {
        method: "POST",
      });

      setProposals(result.proposals);
      setMessage(result.message);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Generation failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function approve(proposal: Proposal) {
    if (
      !window.confirm(
        `Approve ${proposal.routeName} for an additional ` +
          `${money(proposal.additionalCostInr)}? No original-booking refund.`
      )
    )
      return;

    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<{
        message: string;
        estimatedArrival: string;
      }>(`/transit-recovery/proposals/${proposal.id}/approve`, {
        method: "POST",
      });

      setProposals([]);
      setMessage(
        `${result.message}. Arrival: ` + date(result.estimatedArrival)
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="transit-recovery-container">
      <div className="transit-controls-bar">
        <div className="transit-select-wrap">
          <label htmlFor="transit-shipment-select">
            Select an in-transit candidate:
          </label>
          <select
            id="transit-shipment-select"
            aria-label="Shipment for transit recovery"
            value={selected}
            disabled={busy || shipments.length === 0}
            onChange={(event) => {
              setSelected(event.target.value);
              setProposals([]);
              setMessage("");
            }}
          >
            <option value="">
              {shipments.length === 0
                ? "No eligible in-transit shipments"
                : "— Select eligible shipment —"}
            </option>
            {shipments.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.trackingCode}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="primary-button transit-generate-btn"
          disabled={busy || !selected}
          onClick={() => void generate()}
        >
          <Navigation size={15} />
          <span>{busy ? "Evaluating Routes..." : "Find Transfer Routes"}</span>
        </button>
      </div>

      <div className="transit-guidance-note">
        <Info size={15} />
        <span>
          Pause carrier simulation before generating routes. A location update
          newer than 2 minutes is required to ensure waypoint feasibility.
        </span>
      </div>

      {shipments.length === 0 && (
        <div className="recovery-sub-empty">
          <AlertTriangle size={18} />
          <span>
            No assigned shipments are currently Picked Up or In Transit. Out for
            Delivery and Delivered shipments do not qualify for transfer recovery.
          </span>
        </div>
      )}

      {message && (
        <div className="form-alert" role="status">
          <Info size={16} />
          <span>{message}</span>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="transit-proposals-list">
          <div className="proposals-header">
            <h3>Identified Transfer Alternatives</h3>
            <span className="proposals-count">
              {proposals.length} route options
            </span>
          </div>

          <div className="proposals-grid">
            {proposals.map((proposal) => (
              <article className="proposal-card" key={proposal.id}>
                <div className="proposal-card-head">
                  <div>
                    <span className="proposal-carrier-name">
                      {proposal.routeName}
                    </span>
                    <span className="proposal-mode">
                      Carrier: {proposal.carrierName} · Mode:{" "}
                      {proposal.transportMode.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div
                    className={`proposal-badge ${
                      proposal.meetsDeadline
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

                <div className="transit-transfer-point">
                  <Navigation size={14} />
                  <span>Transfer Hub: <strong>{proposal.transferPoint}</strong></span>
                </div>

                <div className="proposal-metrics">
                  <div className="prop-metric">
                    <span className="prop-label">Approach Time</span>
                    <strong className="prop-val">
                      {Math.ceil(proposal.approachMinutes)} min
                    </strong>
                  </div>

                  <div className="prop-metric">
                    <span className="prop-label">Handoff Duration</span>
                    <strong className="prop-val">
                      {proposal.handoffMinutes} min
                    </strong>
                  </div>

                  <div className="prop-metric">
                    <span className="prop-label">Time Saved</span>
                    <strong className="prop-val val-highlight">
                      {Math.floor(proposal.timeSavedMinutes)} min
                    </strong>
                  </div>

                  <div className="prop-metric">
                    <span className="prop-label">Predicted Arrival</span>
                    <strong className="prop-val">
                      {date(proposal.estimatedArrival)}
                    </strong>
                  </div>

                  <div className="prop-metric">
                    <span className="prop-label">Replacement Service</span>
                    <strong className="prop-val">
                      {money(proposal.serviceCostInr)}
                    </strong>
                  </div>

                  <div className="prop-metric">
                    <span className="prop-label">Transfer Charge</span>
                    <strong className="prop-val">
                      {money(proposal.handoffCostInr)}
                    </strong>
                  </div>
                </div>

                <div className="proposal-total-row">
                  <span>Additional Total Commitment:</span>
                  <strong className="val-cost">
                    {money(proposal.additionalCostInr)}
                  </strong>
                </div>

                <div className="proposal-footer">
                  <span className="expiry-hint">
                    Approval rechecks position, service, and net benefit.
                  </span>

                  <button
                    type="button"
                    className="primary-button approve-btn"
                    disabled={busy}
                    onClick={() => void approve(proposal)}
                  >
                    <CheckCircle2 size={15} />
                    <span>Approve Transfer Recovery</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
