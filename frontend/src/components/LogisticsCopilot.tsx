import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { apiRequest } from "../lib/api";
import {
  Sparkles,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  RotateCcw,
  Clock,
  Shield,
  Layers,
} from "lucide-react";

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
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function FormattedCopilotContent({ content }: { content: string }) {
  // Normalize markdown formatting that might be compressed onto single lines
  let text = content.replace(/\r\n/g, "\n");
  text = text.replace(/:\*\*\s*\|/g, ":**\n\n|");
  text = text.replace(/\|\s*\|\s*/g, "|\n|");
  text = text.replace(/\|\s*-\s*([A-Za-z0-9])/g, "|\n\n- $1");
  text = text.replace(/([.!?])\s*-\s*([A-Za-z0-9])/g, "$1\n\n- $2");
  text = text.replace(/([.!?])\s+([*-])\s+/g, "$1\n\n$2 ");

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const blocks: Array<
    | { type: "paragraph"; text: string }
    | { type: "table"; headers: string[]; rows: string[][] }
    | { type: "list"; items: string[] }
  > = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if table row (starts and ends with pipe or has multiple pipes)
    if (line.startsWith("|") && (line.endsWith("|") || line.includes("|"))) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].startsWith("|") &&
        (lines[i].endsWith("|") || lines[i].includes("|"))
      ) {
        tableLines.push(lines[i]);
        i++;
      }

      if (tableLines.length >= 2) {
        // Headers from first line
        const headers = tableLines[0]
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);

        // Check for separator line e.g. |---|---|
        const hasSep = /^\|[\s-:]+\|/.test(tableLines[1]);
        const dataLines = hasSep ? tableLines.slice(2) : tableLines.slice(1);

        const rows = dataLines.map((rowLine) => {
          const cells = rowLine.split("|").map((c) => c.trim());
          if (
            cells.length > 2 &&
            cells[0] === "" &&
            cells[cells.length - 1] === ""
          ) {
            return cells.slice(1, -1);
          }
          return cells.filter((c, idx) => {
            if (idx === 0 && c === "") return false;
            return true;
          });
        });

        blocks.push({ type: "table", headers, rows });
        continue;
      } else {
        blocks.push({ type: "paragraph", text: tableLines[0] });
        continue;
      }
    }

    // Check if list item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith("- ") || lines[i].startsWith("* "))
      ) {
        items.push(lines[i].slice(2).trim());
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Normal paragraph
    blocks.push({ type: "paragraph", text: line });
    i++;
  }

  return (
    <div className="copilot-ai-body">
      {blocks.map((block, idx) => {
        if (block.type === "paragraph") {
          return (
            <p key={idx} className="copilot-ai-paragraph">
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === "table") {
          return (
            <div key={idx} className="copilot-ai-table-wrap">
              <table className="copilot-ai-table">
                <thead>
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => {
                        const isRisk =
                          cell.includes("Delayed") ||
                          cell.includes("Critical") ||
                          cell.includes("At Risk");
                        const isDelivered = cell.includes("Delivered");
                        const isMoney = cell.includes("₹");

                        return (
                          <td
                            key={cIdx}
                            className={
                              isRisk
                                ? "cell-risk"
                                : isDelivered
                                ? "cell-delivered"
                                : isMoney
                                ? "cell-money"
                                : ""
                            }
                          >
                            {renderInline(cell)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={idx} className="copilot-ai-list">
              {block.items.map((item, lIdx) => (
                <li key={lIdx}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        return null;
      })}
    </div>
  );
}

export default function LogisticsCopilot({
  shipmentId,
  shipmentLabel,
}: Props) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversation, setConversation] = useState<CopilotTurn[]>([]);

  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function ask(input: string) {
    const value = input.trim();

    if (value.length < 3 || value.length > 500) {
      setError("Enter a question between 3 and 500 characters.");
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
      const response = await apiRequest<CopilotResponse>("/workspace/copilot", {
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
      });

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
      <div className="copilot-header">
        <div className="copilot-title-group">
          <div className="copilot-badge-row">
            <span className="section-eyebrow eyebrow-dark">
              SWIFTCHAIN INTELLIGENCE
            </span>
            <span
              className={`copilot-scope-pill ${
                shipmentId ? "scope-shipment" : "scope-workspace"
              }`}
            >
              <Layers size={13} />
              <span>
                {shipmentId
                  ? `Focus: ${shipmentLabel ?? "Selected Shipment"}`
                  : "Scope: Authorized Workspace"}
              </span>
            </span>
          </div>

          <h2 id="logistics-copilot-title">Logistics Copilot</h2>
          <p className="tracking-muted">
            {shipmentId
              ? `Focused on ${shipmentLabel ?? "selected shipment"}. Close shipment details to query across all workspace shipments.`
              : "Query shipment deadlines, delays, financial impact, and recovery options."}
          </p>
        </div>

        {conversation.length > 0 && (
          <button
            type="button"
            className="secondary-button btn-clear-convo"
            disabled={busy}
            onClick={() => {
              setConversation([]);
              setResult(null);
              setQuestion("");
              setError("");
            }}
          >
            <RotateCcw size={14} />
            <span>Clear Thread</span>
          </button>
        )}
      </div>

      {/* Suggested Question Pills */}
      <div className="copilot-suggestions-bar">
        <span className="suggestions-label">
          <HelpCircle size={14} />
          <span>Suggested:</span>
        </span>
        <div className="suggestions-list">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="secondary-button btn-suggestion"
              disabled={busy}
              onClick={() => void ask(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Thread History */}
      {conversation.length > 2 && (
        <details className="copilot-history">
          <summary>
            <MessageSquare size={14} />
            <span>Previous questions and answers ({conversation.length / 2})</span>
          </summary>
          <div className="copilot-history-turns">
            {conversation.slice(0, -2).map((turn, index) => (
              <div
                key={index}
                className={`copilot-history-turn turn-${turn.role}`}
              >
                <strong className="turn-author">
                  {turn.role === "user" ? "You" : "SwiftChain Logistics Copilot"}
                </strong>
                {turn.role === "user" ? (
                  <p className="turn-content">{turn.content}</p>
                ) : (
                  <FormattedCopilotContent content={turn.content} />
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Question Form */}
      <form className="copilot-form" onSubmit={submit}>
        <div className="copilot-input-wrap">
          <textarea
            id="copilot-question"
            aria-label="Ask about shipment status, risk, cost, or recovery"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            minLength={3}
            maxLength={500}
            required
            rows={3}
            placeholder="Ask anything about current shipment risk, ETA calculations, or financial exposure..."
            disabled={busy}
          />
        </div>

        <div className="copilot-form-footer">
          <span className="copilot-input-count">
            {question.length}/500 chars
          </span>

          <button
            type="submit"
            className="primary-button copilot-ask-btn"
            disabled={busy || question.trim().length < 3}
          >
            <Sparkles size={16} />
            <span>{busy ? "Analyzing records..." : "Ask Copilot"}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="form-alert" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Copilot Result Block */}
      {result && (
        <div className="copilot-response" aria-live="polite">
          {/* AI Explanation via SwiftChain Logistics Copilot */}
          {result.aiSummary && (
            <div className="copilot-ai-summary">
              <div className="ai-summary-head">
                <div className="ai-summary-title-row">
                  <Sparkles size={18} className="ai-sparkle-icon" />
                  <strong>SwiftChain Logistics Copilot</strong>
                </div>
                <span className="ai-copilot-tag">AI Analysis</span>
              </div>
              <FormattedCopilotContent content={result.aiSummary} />
            </div>
          )}

          {/* AI Fallback Notice */}
          {result.aiUnavailable && (
            <div className="form-alert ai-fallback-alert" role="status">
              <AlertTriangle size={16} />
              <span>
                {result.aiUnavailable} Deterministic shipment records and
                supporting evidence cards are provided below.
              </span>
            </div>
          )}

          {/* Deterministic Facts */}
          <div className="copilot-facts">
            <div className="facts-head">
              <Shield size={16} />
              <strong>Verified Shipment Records</strong>
            </div>
            <p className="facts-text">{result.answer}</p>
          </div>

          <div className="copilot-meta-row">
            <Clock size={13} />
            <span>
              {result.scope} · Evaluated at {date(result.generatedAt)}. Showing up
              to 10 supporting shipments.
            </span>
          </div>

          {/* Supporting Evidence Cards */}
          {result.shipments.length > 0 && (
            <div className="copilot-evidence">
              <div className="evidence-title">
                <h4>Supporting Shipment Records ({result.shipments.length})</h4>
              </div>

              <div className="evidence-cards-grid">
                {result.shipments.map((shipment) => (
                  <article key={shipment.id} className="evidence-card">
                    <div className="evidence-card-head">
                      <strong className="evidence-code">
                        {shipment.trackingCode}
                      </strong>
                      <span className="badge badge-progress">
                        {shipment.trackingStatus.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="evidence-route">
                      <span>{shipment.route}</span>
                    </div>

                    <div className="evidence-meta-list">
                      <div className="ev-meta">
                        <span>Carrier:</span>
                        <strong>{shipment.carrierName ?? "Not booked"}</strong>
                      </div>
                      <div className="ev-meta">
                        <span>Deadline:</span>
                        <strong>{date(shipment.deadline)}</strong>
                      </div>
                      {shipment.estimatedArrival && (
                        <div className="ev-meta">
                          <span>Assessed Arrival:</span>
                          <strong>{date(shipment.estimatedArrival)}</strong>
                        </div>
                      )}
                    </div>

                    {shipment.reasons.length > 0 && (
                      <ul className="evidence-reasons">
                        {shipment.reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                    )}

                    {shipment.evaluatedAt && (
                      <small className="tracking-muted evidence-timestamp">
                        Last SLA check: {date(shipment.evaluatedAt)}
                      </small>
                    )}

                    {shipment.recoveryLabel && (
                      <div className="evidence-recovery-tag">
                        <span>Approved Route: {shipment.recoveryLabel}</span>
                      </div>
                    )}

                    {shipment.savedProposalCount > 0 && (
                      <div className="evidence-proposals-tag">
                        <span>
                          Pending Recovery Proposals:{" "}
                          {shipment.savedProposalCount}
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
