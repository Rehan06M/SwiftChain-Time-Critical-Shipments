import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Info,
} from "lucide-react";

interface ShipmentAlert {
  id: string;
  shipmentId: string;
  trackingCode: string;
  riskStatus: "On Track" | "At Risk" | "Critical Risk" | "Delayed";
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
        const result = await apiRequest<AlertResponse>("/alerts", {
          cache: "no-store",
          signal: controller.signal,
        });

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

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <section className="shipment-alerts-card" aria-labelledby="alerts-card-title">
      <div className="alerts-card-header">
        <div className="alerts-title-wrap">
          <div className="alerts-bell-icon">
            <Bell size={18} />
            {unreadCount > 0 && <span className="alerts-unread-dot" />}
          </div>
          <div>
            <h2 id="alerts-card-title">SLA Risk Alerts</h2>
            <p className="tracking-muted" aria-live="polite">
              {data
                ? `${data.unreadCount} unread notification${data.unreadCount === 1 ? "" : "s"}`
                : "Loading alerts..."}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="secondary-button alerts-refresh-btn"
          onClick={() => setRefreshKey((value) => value + 1)}
          title="Refresh alerts"
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="form-alert" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {data?.alerts.length === 0 ? (
        <div className="alerts-empty-state">
          <CheckCircle2 size={28} />
          <p>All shipments are operating within SLA tolerances.</p>
          <small className="tracking-muted">
            New risk updates and recovery events will automatically appear here.
          </small>
        </div>
      ) : (
        <ul className="shipment-alert-list">
          {data?.alerts.map((alert) => {
            const riskClass = alert.riskStatus
              .toLowerCase()
              .replaceAll(" ", "-");
            const isRead = Boolean(alert.readAt);

            return (
              <li
                key={alert.id}
                className={`alert-item ${isRead ? "is-read" : "is-unread"}`}
              >
                <div className="alert-item-top">
                  <div className="alert-item-title-group">
                    {!isRead && <span className="alert-dot" />}
                    <strong className="alert-item-title">{alert.title}</strong>
                    <span className="alert-code-ref">
                      Shipment: <strong>{alert.trackingCode}</strong>
                    </span>
                  </div>

                  <span className={`badge badge-risk risk-${riskClass}`}>
                    {alert.riskStatus}
                  </span>
                </div>

                <p className="alert-item-msg">{alert.message}</p>

                <div className="alert-item-footer">
                  <div className="alert-time-wrap">
                    <Clock size={13} />
                    <span>
                      {new Date(alert.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      · {isRead ? "Read" : "Unread"}
                    </span>
                  </div>

                  {!isRead && (
                    <button
                      type="button"
                      className="secondary-button btn-mark-read"
                      disabled={busyId === alert.id}
                      onClick={() => void markRead(alert.id)}
                    >
                      <CheckCircle2 size={13} />
                      <span>
                        {busyId === alert.id ? "Saving..." : "Mark as read"}
                      </span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.alerts.length > 0 && (
        <div className="alerts-footer-note">
          <Info size={13} />
          <span>
            Showing latest 50 notifications. Notifications reflect point-in-time
            events; check the shipment details panel for live telemetry and ETA.
          </span>
        </div>
      )}
    </section>
  );
}
