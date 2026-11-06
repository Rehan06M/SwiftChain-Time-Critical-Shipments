import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { apiRequest } from "../lib/api";

interface Props {
  shipmentId?: string;
  shipmentLabel?: string;
}

interface CopilotTurn {
  role: "user" | "assistant";
  content: string;
}

interface CopilotShipment {
  id: string;
  trackingCode: string;
  route: string;
  trackingStatus: string;
  carrierName: string | null;
  evaluatedAt: string | null;
  estimatedArrival: string | null;
  deadline: string;
  reasons: string[];
  recoveryLabel: string | null;
  savedProposalCount: number;
}

interface CopilotResponse {
  answer: string;
  generatedAt: string;
  scope: string;
  shipments: CopilotShipment[];
  aiSummary: string | null;
aiUnavailable: string | null;
}

const suggestions = [
  "Summarize my shipments",
  "Which shipments need attention?",
  "Explain the risk",
  "What is the financial impact?",
  "What recovery options are saved?",
];

const date = (value: string) =>
  new Date(value).toLocaleString("en-IN");

export default function LogisticsCopilot({
  shipmentId,
  shipmentLabel,
}: Props) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversation, setConversation] =
  useState<CopilotTurn[]>([]);

  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function ask(input: string) {
    const value = input.trim();

    if (value.length < 3 || value.length > 500) {
      setError("Enter a question of 3–500 characters.");
      return;
    }

    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setQuestion(value);
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const response = await apiRequest<CopilotResponse>(
        "/workspace/copilot",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
  question: value,
  shipmentId,

  history: conversation.slice(-6).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, 800),
  })),
}),
        }
      );

      if (!controller.signal.aborted) {
  setResult(response);

  const userTurn: CopilotTurn = {
    role: "user",
    content: value,
  };

  const assistantTurn: CopilotTurn = {
    role: "assistant",
    content: response.aiSummary ?? response.answer,
  };

  setConversation((previous) =>
    [...previous, userTurn, assistantTurn].slice(-8)
  );
}
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load copilot response."
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;

        if (!controller.signal.aborted) {
          setBusy(false);
        }
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section
      className="role-dashboard-card logistics-copilot"
      aria-labelledby="logistics-copilot-title"
    >
      <span className="section-eyebrow eyebrow-dark">
        SWIFTCHAIN ASSISTANT
      </span>

      <h2 id="logistics-copilot-title">Logistics copilot</h2>

      <p className="tracking-muted">
        {shipmentId
          ? `Scope: ${shipmentLabel ?? "selected shipment"}. Close shipment details to ask about your workspace.`
          : "Scope: your authorized workspace shipments."}
      </p>

      <p className="tracking-muted">
  Shipment facts come from your authorized records.
  Groq explains the displayed shipments and supports follow-up
  questions. Check important details against the supporting cards.
</p>

      <div className="copilot-suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void ask(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>


       {conversation.length > 2 && (
  <details className="copilot-history">
    <summary>Previous questions and answers</summary>

    {conversation.slice(0, -2).map((turn, index) => (
      <div key={index} className="copilot-history-turn">
        <strong>
          {turn.role === "user" ? "You" : "Copilot"}
        </strong>
        <p>{turn.content}</p>
      </div>
    ))}
  </details>
)}

{conversation.length > 0 && (
  <button
    type="button"
    className="secondary-button"
    disabled={busy}
    onClick={() => {
      setConversation([]);
      setResult(null);
      setQuestion("");
      setError("");
    }}
  >
    Clear conversation
  </button>
)}

      <form className="copilot-form" onSubmit={submit}>
        <label htmlFor="copilot-question">
          Ask about shipment status, risk, cost or recovery
        </label>

        <textarea
          id="copilot-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          minLength={3}
          maxLength={500}
          required
          rows={3}
          placeholder="Which shipments need attention?"
          disabled={busy}
        />

        <button
          type="submit"
          className="primary-button"
          disabled={busy || question.trim().length < 3}
        >
          {busy ? "Checking shipment records..." : "Ask copilot"}
        </button>
      </form>

      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="copilot-response" aria-live="polite">
          <div className="copilot-facts">
  <strong>Shipment facts</strong>
  <p>{result.answer}</p>
</div>

{result.aiSummary && (
  <div className="copilot-ai-summary">
    <strong>AI explanation · Groq</strong>

    <p className="copilot-ai-text">
      {result.aiSummary}
    </p>
  </div>
)}

{result.aiUnavailable && (
  <p className="form-alert" role="status">
    {result.aiUnavailable}
    {" "}The shipment facts and supporting cards are still shown.
  </p>
)}

          <p className="tracking-muted">
            {result.scope} Checked {date(result.generatedAt)}.
            Up to 10 supporting shipments are shown.
          </p>

          <div className="copilot-evidence">
            {result.shipments.map((shipment) => (
              <article key={shipment.id}>
                <h3>{shipment.trackingCode}</h3>

                <p>
                  {shipment.route}
                  {" · "}
                  {shipment.trackingStatus.replaceAll("_", " ")}
                </p>

                <p>
                  Carrier: {shipment.carrierName ?? "Not booked"}
                </p>

                <p>Deadline: {date(shipment.deadline)}</p>

                {shipment.estimatedArrival && (
                  <p>
                    Assessed arrival: {date(shipment.estimatedArrival)}
                  </p>
                )}

                <ul>
                  {shipment.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>

                {shipment.evaluatedAt && (
                  <p className="tracking-muted">
                    Last SLA assessment: {date(shipment.evaluatedAt)}
                  </p>
                )}

                {shipment.recoveryLabel && (
                  <p>
                    Approved route: {shipment.recoveryLabel}
                  </p>
                )}

                {shipment.savedProposalCount > 0 && (
                  <p>
                    Saved pending recovery proposals:{" "}
                    {shipment.savedProposalCount}.
                    Revalidate in the recovery workflow.
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}