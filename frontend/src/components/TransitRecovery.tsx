import { useState } from "react";
import { apiRequest } from "../lib/api";

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
    if (!window.confirm(
      `Approve ${proposal.routeName} for an additional ` +
      `${money(proposal.additionalCostInr)}? No original-booking refund.`
    )) return;

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
        `${result.message}. Arrival: ` +
        new Date(result.estimatedArrival).toLocaleString("en-IN")
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Approval failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tracking-panel">
      <h2>In-Transit Recovery</h2>

      <p>
        Pause location simulation before generating options.
        A location newer than two minutes is required.
      </p>

      <select
        aria-label="Shipment for transit recovery"
        value={selected}
        disabled={busy}
        onChange={(event) => {
          setSelected(event.target.value);
          setProposals([]);
          setMessage("");
        }}
      >
        <option value="">Select an assigned shipment</option>
        {shipments.map((shipment) => (
          <option key={shipment.id} value={shipment.id}>
            {shipment.trackingCode}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="primary-button"
        disabled={busy || !selected}
        onClick={() => void generate()}
      >
        {busy ? "Processing..." : "Find transfer routes"}
      </button>

      {message && <p role="status">{message}</p>}

      {proposals.map((proposal) => (
        <article className="tracking-simulator" key={proposal.id}>
          <h3>{proposal.routeName}</h3>

          <p>
            {proposal.carrierName} ·{" "}
            {proposal.transportMode.replaceAll("_", " ")}
          </p>

          <p>Transfer: {proposal.transferPoint}</p>

          <p>
            Approach: {Math.ceil(proposal.approachMinutes)} min
            {" · "}
            Handoff/pickup: {proposal.handoffMinutes} min
          </p>

          <p>
            Replacement service: {money(proposal.serviceCostInr)}
            {" · "}
            Transfer charge: {money(proposal.handoffCostInr)}
          </p>

          <p>
            <strong>
              Additional total: {money(proposal.additionalCostInr)}
            </strong>
          </p>

          <p>
            Time saved: {Math.floor(proposal.timeSavedMinutes)} min
          </p>

          <p>
            Arrival:{" "}
            {new Date(proposal.estimatedArrival).toLocaleString("en-IN")}
          </p>

          <p>
            {proposal.meetsDeadline
              ? "Estimated to meet the deadline"
              : "Improves arrival but still misses the deadline"}
          </p>

          <p className="tracking-muted">
            Configured simulation route. Stop movement while reviewing.
            Approval rechecks position, service, cost and benefit.
          </p>

          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void approve(proposal)}
          >
            Approve transfer recovery
          </button>
        </article>
      ))}
    </section>
  );
}