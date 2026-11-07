import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Info,
} from "lucide-react";

interface ETAData {
  status: "active" | "delivered";
  prediction: {
    calculated_at: string;
    estimated_arrival: string;
    remaining_minutes: number;
    slack_minutes: number;
    predicted_late_by_minutes: number;
    risk_status: "On Track" | "At Risk" | "Critical Risk" | "Delayed";
    explanation: string;
  } | null;
  remainingDistanceKm?: number;
  locationRecordedAt?: string | null;
  locationStale?: boolean;
  estimateBasis?: string;
}

const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function ShipmentETA({
  shipmentId,
  trackingVersion,
}: {
  shipmentId: string;
  trackingVersion: string;
}) {
  const [data, setData] = useState<ETAData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;

      try {
        const result = await apiRequest<ETAData>(
          `/tracking/${encodeURIComponent(shipmentId)}/eta`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to calculate ETA"
          );
          setData(null);
        }
      } finally {
        pending = false;
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 30_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [shipmentId, trackingVersion]);

  return (
    <section className="eta-panel-card">
      <div className="eta-panel-head">
        <Clock size={18} />
        <h4>Estimated Arrival & Delay Risk</h4>
      </div>

      {error ? (
        <div className="form-alert" role="status">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : !data ? (
        <p className="tracking-muted">Calculating real-time ETA telemetry...</p>
      ) : data.status === "delivered" ? (
        <div className="delivered-badge-large">
          <CheckCircle2 size={20} />
          <strong>Delivered — No active ETA prediction required.</strong>
        </div>
      ) : data.prediction ? (
        <div className="eta-content-block">
          <div className="eta-risk-row">
            <span className="eta-label">SLA Risk Assessment:</span>
            <span
              className={`badge badge-risk risk-${data.prediction.risk_status
                .toLowerCase()
                .replaceAll(" ", "-")}`}
            >
              {data.prediction.risk_status}
            </span>
          </div>

          <div className="eta-stats-grid">
            <div className="eta-stat-item">
              <span className="eta-stat-label">Estimated Arrival</span>
              <strong className="eta-stat-val">
                {date(data.prediction.estimated_arrival)}
              </strong>
            </div>

            <div className="eta-stat-item">
              <span className="eta-stat-label">Remaining Duration</span>
              <strong className="eta-stat-val">
                {Math.ceil(data.prediction.remaining_minutes)} minutes
              </strong>
            </div>

            {data.remainingDistanceKm !== undefined && (
              <div className="eta-stat-item">
                <span className="eta-stat-label">Straight-Line Distance</span>
                <strong className="eta-stat-val">
                  {data.remainingDistanceKm} km
                </strong>
              </div>
            )}

            <div className="eta-stat-item">
              <span className="eta-stat-label">Deadline Buffer</span>
              <strong className="eta-stat-val">
                {Math.round(data.prediction.slack_minutes)} minutes
              </strong>
            </div>
          </div>

          <p className="eta-explanation">{data.prediction.explanation}</p>

          {data.locationStale && (
            <div className="form-alert" role="alert">
              <ShieldAlert size={16} />
              <span>
                Location is missing or older than 2 minutes. This estimate may
                not reflect current progress.
              </span>
            </div>
          )}

          <div className="eta-basis-note">
            <Info size={13} />
            <span>
              Rule-based estimate: {data.estimateBasis}. Reassessed at{" "}
              {new Date(data.prediction.calculated_at).toLocaleTimeString(
                "en-IN"
              )}
              .
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
