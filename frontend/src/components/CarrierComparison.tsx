
import {
  useEffect,
  useState,
} from "react";

import {
  X,
  Truck,
  Clock3,
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

export default function CarrierComparison({
  shipment,
  onClose,
}: Props) {
  const [data, setData] =
    useState<CarrierMatchingResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getCarrierMatches(
          shipment.id
        );

        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load recommendations"
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
    <div
      className="carrier-modal-backdrop"
      role="presentation"
    >
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

            <h2 id="carrier-modal-title">
              Carrier Recommendations
            </h2>

            <p>
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

        <div className="carrier-shipment-summary">
          <div>
            <span>Route</span>
            <strong>
              {shipment.originCity} →{" "}
              {shipment.destinationCity}
            </strong>
          </div>

          <div>
            <span>Cargo</span>
            <strong>
              {shipment.cargoType} ·{" "}
              {shipment.weightKg} kg
            </strong>
          </div>

          <div>
            <span>Deadline</span>
            <strong>
              {formatDate(shipment.deadline)}
            </strong>
          </div>

          <div>
            <span>Urgency</span>
            <strong>
              {data
                ? `${data.urgencyScore}/100 — ${data.urgencyLevel}`
                : `${shipment.urgency.score}/100`}
            </strong>
          </div>
        </div>

        <div className="carrier-toolbar">
          <p>
            Carrier estimates are simulated
            demonstration data, not guaranteed
            delivery commitments.
          </p>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setRevision((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {loading && (
          <div className="carrier-message">
            Calculating eligible carrier matches...
          </div>
        )}

        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          data?.matches.length === 0 && (
            <div className="carrier-message">
              <AlertTriangle size={28} />

              <h3>No compatible carrier found</h3>

              <p>
                No currently available demonstration
                service supports this route, cargo
                type, and weight combination.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          data &&
          data.matches.length > 0 && (
            <div className="carrier-results">
              {data.matches.map((carrier) => (
                <article
                  className="carrier-card"
                  key={carrier.laneId}
                >
                  <div className="carrier-card-heading">
                    <div className="carrier-name-group">
                      <div className="carrier-icon">
                        <Truck size={22} />
                      </div>

                      <div>
                        <span className="carrier-rank">
                          {carrier.rank === 1
                            ? "BEST OVERALL MATCH"
                            : `RANK #${carrier.rank}`}
                        </span>

                        <h3>
                          {carrier.carrierName}
                        </h3>

                        <p>
                          {carrier.transportMode ===
                          "air_ground"
                            ? "Air + Ground"
                            : "Ground Transport"}
                        </p>
                      </div>
                    </div>

                    <div className="carrier-match-score">
                      <strong>
                        {carrier.matchingScore}
                      </strong>
                      <span>/100 match</span>
                    </div>
                  </div>

                  <div className="carrier-metrics">
                    <div>
                      <Clock3 size={19} />
                      <span>Estimated time</span>
                      <strong>
                        {formatDuration(
                          carrier.estimatedMinutes
                        )}
                      </strong>
                    </div>

                    <div>
                      <ShieldCheck size={19} />
                      <span>On-time history</span>
                      <strong>
                        {carrier.reliability}%
                      </strong>
                    </div>

                    <div>
                      <Wallet size={19} />
                      <span>Estimated cost</span>
                      <strong>
                        {formatMoney(
                          carrier.estimatedCostInr
                        )}
                      </strong>
                    </div>
                  </div>

                  <div
                    className={
                      carrier.meetsDeadline
                        ? "carrier-feasibility feasible"
                        : "carrier-feasibility infeasible"
                    }
                  >
                    {carrier.meetsDeadline ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}

                    <div>
                      <strong>
                        {carrier.recommendation}
                      </strong>

                      <p>
                        Estimated arrival:{" "}
                        {formatDate(
                          carrier.estimatedArrival
                        )}
                      </p>

                      <p>
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
          <p>
            Carrier comparison only. Selection,
            pricing confirmation, and booking will
            be implemented in Step 7.
          </p>

          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
