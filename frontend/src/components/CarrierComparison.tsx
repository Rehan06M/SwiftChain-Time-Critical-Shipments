import { useEffect, useState } from "react";
import {
  X,
  Truck,
  Clock,
  ShieldCheck,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import type { Shipment } from "../lib/shipments";
import {
  getCarrierMatches,
  type CarrierMatchingResponse,
} from "../lib/carriers";

interface Props {
  shipment: Shipment;
  onClose: () => void;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CarrierComparison({ shipment, onClose }: Props) {
  const [data, setData] = useState<CarrierMatchingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getCarrierMatches(shipment.id);
        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load recommendations"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [shipment.id, revision]);

  return (
    <div className="carrier-modal-backdrop" role="presentation">
      <section
        className="carrier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrier-modal-title"
      >
        <header className="carrier-modal-header">
          <div>
            <span className="section-eyebrow eyebrow-dark">
              SMART CARRIER MATCHING
            </span>
            <h2 id="carrier-modal-title">Carrier Recommendations</h2>
            <p className="tracking-muted">
              Shipment {shipment.trackingCode}
            </p>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close carrier comparison"
          >
            <X size={20} />
          </button>
        </header>

        {/* Shipment Overview Row */}
        <div className="carrier-shipment-summary">
          <div className="sum-block">
            <span className="sum-label">Route</span>
            <strong className="sum-val">
              {shipment.originCity} → {shipment.destinationCity}
            </strong>
          </div>

          <div className="sum-block">
            <span className="sum-label">Cargo</span>
            <strong className="sum-val">
              {shipment.cargoType} · {shipment.weightKg} kg
            </strong>
          </div>

          <div className="sum-block">
            <span className="sum-label">Deadline</span>
            <strong className="sum-val">{formatDate(shipment.deadline)}</strong>
          </div>

          <div className="sum-block">
            <span className="sum-label">Urgency Score</span>
            <strong className="sum-val val-urgency">
              {data
                ? `${data.urgencyScore}/100 — ${data.urgencyLevel}`
                : `${shipment.urgency.score}/100`}
            </strong>
          </div>
        </div>

        {/* Toolbar & Simulation Disclaimer */}
        <div className="carrier-toolbar">
          <p className="tracking-muted">
            Carrier estimates represent simulated demonstration data, not
            guaranteed delivery commitments.
          </p>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setRevision((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw size={15} />
            <span>Recalculate</span>
          </button>
        </div>

        {loading && (
          <div className="carrier-message">
            <RefreshCw size={24} className="spin-icon" />
            <span>Evaluating eligible carrier performance models...</span>
          </div>
        )}

        {error && (
          <div className="form-alert" role="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data?.matches.length === 0 && (
          <div className="carrier-message">
            <AlertTriangle size={28} />
            <h3>No Compatible Carrier Found</h3>
            <p>
              No currently available demonstration carrier supports this route,
              cargo type, and weight combination.
            </p>
          </div>
        )}

        {!loading && !error && data && data.matches.length > 0 && (
          <div className="carrier-results">
            {data.matches.map((carrier) => (
              <article className="carrier-card" key={carrier.laneId}>
                <div className="carrier-card-heading">
                  <div className="carrier-name-group">
                    <div className="carrier-icon">
                      <Truck size={22} />
                    </div>

                    <div>
                      <span
                        className={`carrier-rank ${
                          carrier.rank === 1 ? "rank-best" : "rank-standard"
                        }`}
                      >
                        {carrier.rank === 1
                          ? "BEST OVERALL MATCH"
                          : `RANK #${carrier.rank}`}
                      </span>

                      <h3>{carrier.carrierName}</h3>

                      <p className="carrier-mode-text">
                        {carrier.transportMode === "air_ground"
                          ? "Air + Ground Intermodal"
                          : "Ground Transport"}
                      </p>
                    </div>
                  </div>

                  <div className="carrier-match-score">
                    <strong>{carrier.matchingScore}</strong>
                    <span>/100 match</span>
                  </div>
                </div>

                <div className="carrier-metrics">
                  <div className="metric-col">
                    <Clock size={16} />
                    <span>Estimated Duration</span>
                    <strong>{formatDuration(carrier.estimatedMinutes)}</strong>
                  </div>

                  <div className="metric-col">
                    <ShieldCheck size={16} />
                    <span>On-Time Reliability</span>
                    <strong>{carrier.reliability}%</strong>
                  </div>

                  <div className="metric-col">
                    <Wallet size={16} />
                    <span>Estimated Cost</span>
                    <strong className="cost-val">
                      {formatMoney(carrier.estimatedCostInr)}
                    </strong>
                  </div>
                </div>

                <div
                  className={`carrier-feasibility ${
                    carrier.meetsDeadline ? "feasible" : "infeasible"
                  }`}
                >
                  {carrier.meetsDeadline ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}

                  <div className="feasibility-text">
                    <strong>{carrier.recommendation}</strong>
                    <p>Estimated arrival: {formatDate(carrier.estimatedArrival)}</p>
                    <p className="feasibility-sub">
                      {carrier.meetsDeadline
                        ? `${carrier.minutesBeforeDeadline} minutes before deadline`
                        : `${Math.abs(carrier.minutesBeforeDeadline)} minutes after deadline`}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="carrier-modal-footer">
          <p className="tracking-muted">
            Carrier comparison only. Selection, pricing confirmation, and
            booking are confirmed via the Get Quote workflow.
          </p>

          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
