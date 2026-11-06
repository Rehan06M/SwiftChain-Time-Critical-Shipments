import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import TransitRecovery from "../components/TransitRecovery";

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

export default function DispatcherRecovery() {
  const [shipments, setShipments] = useState<AssignedShipment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

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

    void load(controller.signal).catch((err) => {
      if (!controller.signal.aborted) {
        setMessage(
          err instanceof Error ? err.message : "Unable to load shipments"
        );
      }
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
        `${result.message}. New estimated arrival: ` +
        new Date(result.estimatedArrival).toLocaleString("en-IN")
      );

      await load();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Approval failed"
      );
    } finally {
      setBusy(false);
    }
  }

  const selected = shipments.find(
    (shipment) => shipment.id === selectedId
  );

  const beforePickupShipments = shipments.filter(
  (shipment) =>
    shipment.trackingStatus === "booked" &&
    shipment.locationRecordedAt === null
);

const transitShipments = shipments.filter(
  (shipment) =>
    shipment.trackingStatus === "picked_up" ||
    shipment.trackingStatus === "in_transit"
);

  return (
    <main className="shipments-container">
      <Link to="/dashboard/dispatcher">
        ← Dispatcher dashboard
      </Link>

      <h1>Shipment Recovery</h1>

      <p>
  Review before-pickup alternatives or configured transfer routes
  for shipments already moving. Replacement costs are additional;
  the original booking is not refunded.
</p>

      {message && <div className="form-alert" role="status">{message}</div>}

      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          void load().catch((err) => {
            setMessage(
              err instanceof Error ? err.message : "Refresh failed"
            );
          });
        }}
      >
        Refresh shipments
      </button>

      {shipments.length === 0 && (
        <p>No active assigned shipments.</p>
      )}

      <h2>Before-pickup recovery</h2>

<p className="tracking-muted">
  Carrier replacements before pickup or recorded location movement.
</p>

{beforePickupShipments.length === 0 && (
  <p>No assigned shipments currently qualify for before-pickup recovery.</p>
)}

{beforePickupShipments.map((shipment) => (
        <section className="tracking-panel" key={shipment.id}>
          <h3>{shipment.trackingCode}</h3>

          <p>
            {shipment.originCity} → {shipment.destinationCity}
          </p>

          <p>
            Deadline: {new Date(shipment.deadline).toLocaleString("en-IN")}
          </p>

          <p>
            Last monitored risk: {shipment.riskStatus ?? "Not assessed"}
          </p>

          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void generate(shipment.id)}
          >
            {busy && selectedId === shipment.id
              ? "Processing..."
              : "Find before-pickup alternatives"}
          </button>
        </section>
      ))}

      <TransitRecovery shipments={transitShipments} />

      {selected && proposals.length > 0 && (
        <section className="tracking-panel">
          <h2>Options for {selected.trackingCode}</h2>

          {proposals.map((proposal) => {
            const expired =
              new Date(proposal.expiresAt).getTime() <= now;

            return (
              <article
                className="tracking-simulator"
                key={proposal.id}
              >
                <h3>{proposal.carrierName}</h3>

                <p>
                  Mode: {proposal.transportMode.replaceAll("_", " ")}
                </p>

                <p>
                  Estimated arrival:{" "}
                  {new Date(proposal.estimatedArrival).toLocaleString("en-IN")}
                </p>

                <p>
                  Time saved: {proposal.timeSavedMinutes} minutes
                </p>

                <p>
                  Additional charge:{" "}
                  <strong>{money(proposal.additionalCostInr)}</strong>
                </p>

                <p>
                  {proposal.meetsDeadline
                    ? "Estimated to meet deadline"
                    : "Improves ETA but still misses deadline"}
                </p>

                <p className="tracking-muted">
                  {expired
                    ? "Expired — generate new options"
                    : `Expires ${new Date(
                        proposal.expiresAt
                      ).toLocaleTimeString("en-IN")}`}
                </p>

                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || expired}
                  onClick={() => void approve(proposal)}
                >
                  Approve recovery
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}