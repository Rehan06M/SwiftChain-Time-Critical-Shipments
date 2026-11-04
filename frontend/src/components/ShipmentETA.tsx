import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

interface ETAData {
  status: "active" | "delivered";
  prediction: {
    calculated_at: string;
    estimated_arrival: string;
    remaining_minutes: number;
    slack_minutes: number;
    predicted_late_by_minutes: number;
    risk_status:
      | "On Track"
      | "At Risk"
      | "Critical Risk"
      | "Delayed";
    explanation: string;
  } | null;
  remainingDistanceKm?: number;
  locationRecordedAt?: string | null;
  locationStale?: boolean;
  estimateBasis?: string;
}

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
            err instanceof Error
              ? err.message
              : "Unable to calculate ETA"
          );
          setData(null);
        }
      } finally {
        pending = false;
      }
    }

    void load();

    // Reassess deadline pressure even without new locations.
    const timer = window.setInterval(() => void load(), 30_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [shipmentId, trackingVersion]);

  return (
    <section className="tracking-simulator">
      <h4>Estimated Arrival & Delay Risk</h4>

      {error ? (
        <p role="status">{error}</p>
      ) : !data ? (
        <p>Calculating ETA...</p>
      ) : data.status === "delivered" ? (
        <p>Delivered — no active ETA prediction.</p>
      ) : data.prediction ? (
        <>
          <p>
            Risk: <strong>{data.prediction.risk_status}</strong>
          </p>

          <p>
            Estimated arrival:{" "}
            <strong>
              {new Date(
                data.prediction.estimated_arrival
              ).toLocaleString("en-IN")}
            </strong>
          </p>

          <p>
            Remaining:{" "}
            {Math.ceil(data.prediction.remaining_minutes)} minutes
            {" · "}
            {data.remainingDistanceKm} km straight-line distance
          </p>

          <p>{data.prediction.explanation}</p>

          {data.locationStale && (
            <p className="form-alert">
              Location is missing or older than two minutes.
              This estimate may not reflect current progress.
            </p>
          )}

          <p className="tracking-muted">
            Rule-based demo estimate. {data.estimateBasis}.
            {" "}Calculated{" "}
            {new Date(
              data.prediction.calculated_at
            ).toLocaleTimeString("en-IN")}.
          </p>
        </>
      ) : null}
    </section>
  );
}