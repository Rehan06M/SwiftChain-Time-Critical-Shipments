import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

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
      await apiRequest(
        `/recovery/${shipmentId}/dispatchers`,
        {
          method: "POST",
          body: JSON.stringify({
            dispatcherEmail: email.trim(),
          }),
        }
      );

      setMessage("Dispatcher assigned.");
      setEmail("");
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Assignment failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tracking-simulator">
      <h4>Recovery Dispatcher</h4>

      <form onSubmit={assign}>
        <label>
          Dispatcher email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="dispatcher@swiftchain.test"
          />
        </label>

        <button
          type="submit"
          className="secondary-button"
          disabled={busy}
        >
          {busy ? "Assigning..." : "Assign dispatcher"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      <ul>
        {dispatchers.map((dispatcher) => (
          <li key={dispatcher.id}>
            {dispatcher.fullName} — {dispatcher.email}
            {!dispatcher.isActive && " (inactive)"}
          </li>
        ))}
      </ul>
    </section>
  );
}