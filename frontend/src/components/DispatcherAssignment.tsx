import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { UserCheck, UserPlus, AlertTriangle, CheckCircle2, Mail, Shield } from "lucide-react";

interface Dispatcher {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
}

export default function DispatcherAssignment({
  shipmentId,
}: {
  shipmentId: string;
}) {
  const [email, setEmail] = useState("");
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    apiRequest<{ dispatchers: Dispatcher[] }>(
      `/recovery/${shipmentId}/dispatchers`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setDispatchers(data.dispatchers);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setMessage(
            err instanceof Error ? err.message : "Unable to load assignments"
          );
        }
      });

    return () => controller.abort();
  }, [shipmentId, refresh]);

  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      await apiRequest(`/recovery/${shipmentId}/dispatchers`, {
        method: "POST",
        body: JSON.stringify({
          dispatcherEmail: email.trim(),
        }),
      });

      setMessage("Dispatcher assigned.");
      setEmail("");
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dispatcher-assignment-card" aria-labelledby="dispatcher-assign-title">
      <div className="dispatcher-assign-head">
        <Shield size={18} />
        <h4 id="dispatcher-assign-title">Recovery Dispatcher Assignment</h4>
      </div>

      <p className="tracking-muted dispatcher-assign-sub">
        Authorize a qualified dispatcher to coordinate re-routing, transit
        handoffs, and exception recovery for this shipment.
      </p>

      <form className="dispatcher-assign-form" onSubmit={assign}>
        <div className="dispatcher-input-group">
          <Mail size={16} className="dispatcher-mail-icon" />
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="dispatcher@swiftchain.test"
            disabled={busy}
            aria-label="Dispatcher email"
          />
        </div>

        <button
          type="submit"
          className="secondary-button dispatcher-submit-btn"
          disabled={busy}
        >
          <UserPlus size={15} />
          <span>{busy ? "Assigning..." : "Assign Dispatcher"}</span>
        </button>
      </form>

      {message && (
        <div
          className={`form-alert ${
            message.toLowerCase().includes("assigned")
              ? "form-alert-success"
              : ""
          }`}
          role="status"
        >
          {message.toLowerCase().includes("assigned") ? (
            <CheckCircle2 size={15} />
          ) : (
            <AlertTriangle size={15} />
          )}
          <span>{message}</span>
        </div>
      )}

      {dispatchers.length > 0 && (
        <div className="assigned-dispatchers-list">
          <span className="dispatchers-list-title">Assigned Dispatchers:</span>
          <div className="dispatchers-tags-grid">
            {dispatchers.map((dispatcher) => (
              <div key={dispatcher.id} className="dispatcher-chip">
                <UserCheck size={14} className="chip-icon" />
                <div className="chip-text">
                  <strong className="chip-name">{dispatcher.fullName}</strong>
                  <span className="chip-email">{dispatcher.email}</span>
                </div>
                {!dispatcher.isActive && (
                  <span className="chip-inactive-tag">Inactive</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
