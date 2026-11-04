import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

interface ShipmentAlert {
  id: string;
  shipmentId: string;
  trackingCode: string;
  riskStatus:
    | "On Track"
    | "At Risk"
    | "Critical Risk"
    | "Delayed";
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

interface AlertResponse {
  alerts: ShipmentAlert[];
  unreadCount: number;
}

export default function ShipmentAlerts() {
  const [data, setData] = useState<AlertResponse | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;

      try {
        const result = await apiRequest<AlertResponse>(
          "/alerts",
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
              : "Unable to load notifications"
          );
        }
      } finally {
        pending = false;
      }
    }

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 10_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  async function markRead(id: string) {
    setBusyId(id);

    try {
      await apiRequest(`/alerts/${id}/read`, {
        method: "PATCH",
      });

      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update notification"
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="shipment-alerts">
      <div className="tracking-heading">
        <div>
          <h2>SLA Alerts</h2>

          <p aria-live="polite">
            {data
              ? `${data.unreadCount} unread notifications`
              : "Loading notifications..."}
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setRefreshKey((value) => value + 1)
          }
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}

      {data?.alerts.length === 0 && (
        <p className="tracking-muted">
          No alerts yet. Risk changes and recoveries will
          appear here.
        </p>
      )}

      <ul className="shipment-alert-list">
        {data?.alerts.map((alert) => (
          <li
            key={alert.id}
            className={
              alert.readAt ? "is-read" : "is-unread"
            }
          >
            <div className="tracking-heading">
              <strong>{alert.title}</strong>

              <span
                className={`sla-risk sla-risk-${alert.riskStatus
                  .toLowerCase()
                  .replaceAll(" ", "-")}`}
              >
                {alert.riskStatus}
              </span>
            </div>

            <p>{alert.message}</p>

            <div className="tracking-heading">
              <small>
                {new Date(alert.createdAt).toLocaleString(
                  "en-IN"
                )}
                {" · "}
                {alert.readAt ? "Read" : "Unread"}
              </small>

              {!alert.readAt && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busyId === alert.id}
                  onClick={() => void markRead(alert.id)}
                >
                  {busyId === alert.id
                    ? "Saving..."
                    : "Mark as read"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data && data.alerts.length > 0 && (
        <p className="tracking-muted">
          Showing the latest 50 notifications. Alerts are
          historical; check the shipment’s ETA panel for
          its current risk.
        </p>
      )}
    </section>
  );
}