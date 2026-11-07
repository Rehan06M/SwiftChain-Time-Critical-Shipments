import { apiRequest } from "../lib/api";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Sliders,
  Play,
  AlertTriangle,
} from "lucide-react";

interface Comparison {
  estimatedArrival: string;
  deadline: string;
  riskStatus: string;
  remainingMinutes: number;
  slackMinutes: number;
  lateByMinutes: number;
  delayExposureInr: number;
}

interface SimulationResult {
  previewOnly: boolean;
  calculatedAt: string;
  delayCostPerHour: number;
  locationStale: boolean;
  baseline: Comparison;
  scenario: Comparison;
  additionalCostInr: number;
  hypotheticalNetBenefitInr: number;
  assumptions: {
    speedFactor: number;
    extraDelayMinutes: number;
    deadlineShiftMinutes: number;
    estimateBasis: string;
  };
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(value);

const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function WhatIfSimulator({
  shipmentId,
}: {
  shipmentId: string;
}) {
  const [speedFactor, setSpeedFactor] = useState("1");
  const [extraDelay, setExtraDelay] = useState("0");
  const [deadlineShift, setDeadlineShift] = useState("0");
  const [additionalCost, setAdditionalCost] = useState("0");

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestController.current?.abort();
  }, []);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestController.current?.abort();

    const controller = new AbortController();
    requestController.current = controller;
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const response = await apiRequest<SimulationResult>(
        `/workspace/${shipmentId}/what-if`,
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            speedFactor: Number(speedFactor),
            extraDelayMinutes: Number(extraDelay),
            deadlineShiftMinutes: Number(deadlineShift),
            additionalCostInr: Number(additionalCost),
          }),
        }
      );

      if (!controller.signal.aborted) {
        setResult(response);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error ? err.message : "Simulation failed"
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  function preset(speed: string, delay: string, cost: string) {
    setSpeedFactor(speed);
    setExtraDelay(delay);
    setAdditionalCost(cost);
    setDeadlineShift("0");
    setResult(null);
  }

  const rows = result
    ? [
        [
          "Arrival",
          date(result.baseline.estimatedArrival),
          date(result.scenario.estimatedArrival),
        ],
        [
          "Deadline",
          date(result.baseline.deadline),
          date(result.scenario.deadline),
        ],
        [
          "Risk Status",
          result.baseline.riskStatus,
          result.scenario.riskStatus,
        ],
        [
          "Remaining Time",
          `${Math.ceil(result.baseline.remainingMinutes)} min`,
          `${Math.ceil(result.scenario.remainingMinutes)} min`,
        ],
        [
          "Deadline Buffer",
          `${Math.round(result.baseline.slackMinutes)} min`,
          `${Math.round(result.scenario.slackMinutes)} min`,
        ],
        [
          "Predicted Lateness",
          `${Math.ceil(result.baseline.lateByMinutes)} min`,
          `${Math.ceil(result.scenario.lateByMinutes)} min`,
        ],
        [
          "Delay Exposure",
          money(result.baseline.delayExposureInr),
          money(result.scenario.delayExposureInr),
        ],
      ]
    : [];

  return (
    <section className="what-if-panel" aria-labelledby="what-if-heading">
      <div className="what-if-header">
        <div className="what-if-title-wrap">
          <Sliders size={18} />
          <div>
            <h3 id="what-if-heading">What-If Logistics Simulator</h3>
            <p className="tracking-muted">
              Hypothetical scenario preview only. Does not alter actual booking,
              deadlines, or carrier routes.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Action Pills */}
      <div className="what-if-presets-bar">
        <span className="presets-tag">Demo Scenarios:</span>
        <div className="presets-list">
          <button
            type="button"
            className="secondary-button btn-preset"
            disabled={busy}
            onClick={() => preset("1", "60", "0")}
          >
            +60m Delay
          </button>
          <button
            type="button"
            className="secondary-button btn-preset"
            disabled={busy}
            onClick={() => preset("0.75", "0", "0")}
          >
            25% Slower
          </button>
          <button
            type="button"
            className="secondary-button btn-preset"
            disabled={busy}
            onClick={() => preset("1.5", "0", "1500")}
          >
            Faster (+₹1,500)
          </button>
          <button
            type="button"
            className="secondary-button btn-preset"
            disabled={busy}
            onClick={() => preset("1", "0", "0")}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Form Controls */}
      <form className="what-if-form" onSubmit={run}>
        <div className="what-if-form-grid">
          <label>
            <span className="input-label">Travel Speed Multiplier</span>
            <input
              type="number"
              min="0.25"
              max="2"
              step="0.05"
              required
              disabled={busy}
              value={speedFactor}
              onChange={(event) => {
                setSpeedFactor(event.target.value);
                setResult(null);
              }}
            />
            <small className="input-hint">1.0 = base, 0.75 = slow, 1.5 = expedited</small>
          </label>

          <label>
            <span className="input-label">Additional Delay (Minutes)</span>
            <input
              type="number"
              min="0"
              max="1440"
              step="1"
              required
              disabled={busy}
              value={extraDelay}
              onChange={(event) => {
                setExtraDelay(event.target.value);
                setResult(null);
              }}
            />
            <small className="input-hint">Transit congestion or inspection</small>
          </label>

          <label>
            <span className="input-label">Hypothetical Deadline Shift (Minutes)</span>
            <input
              type="number"
              min="-1440"
              max="10080"
              step="1"
              required
              disabled={busy}
              value={deadlineShift}
              onChange={(event) => {
                setDeadlineShift(event.target.value);
                setResult(null);
              }}
            />
            <small className="input-hint">+ extends SLA; - tightens deadline</small>
          </label>

          <label>
            <span className="input-label">Hypothetical Additional Cost (INR)</span>
            <input
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              disabled={busy}
              value={additionalCost}
              onChange={(event) => {
                setAdditionalCost(event.target.value);
                setResult(null);
              }}
            />
            <small className="input-hint">Expedited charter or lane surcharge</small>
          </label>
        </div>

        <button
          type="submit"
          className="primary-button what-if-submit-btn"
          disabled={busy}
        >
          <Play size={15} />
          <span>{busy ? "Evaluating Scenarios..." : "Compare Scenarios"}</span>
        </button>
      </form>

      {error && (
        <div className="form-alert" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Comparison Results */}
      {result && (
        <div className="what-if-results">
          {result.locationStale && (
            <div className="form-alert" role="alert">
              <AlertTriangle size={16} />
              <span>
                Location is missing or stale. Both projections rely on the last
                known recorded position.
              </span>
            </div>
          )}

          <div className="what-if-table-scroll">
            <table className="what-if-comparison-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Current Baseline</th>
                  <th>Hypothetical Scenario</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([metric, baseline, scenario]) => (
                  <tr key={metric}>
                    <td className="metric-name">{metric}</td>
                    <td className="baseline-val">{baseline}</td>
                    <td className="scenario-val">{scenario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="what-if-financial-summary">
            <div className="fin-card">
              <span className="fin-label">Additional Scenario Cost</span>
              <strong className="fin-val">{money(result.additionalCostInr)}</strong>
            </div>

            <div className="fin-card fin-card-highlight">
              <span className="fin-label">Hypothetical Net Benefit</span>
              <strong className="fin-val val-benefit">
                {money(result.hypotheticalNetBenefitInr)}
              </strong>
              <small className="fin-hint">(Exposure reduction minus cost)</small>
            </div>
          </div>

          <p className="tracking-muted what-if-disclaimer">
            Assumptions comparison only. Savings are not guaranteed. Actual
            carrier reassignment requires formal recovery approval in the recovery
            workspace.
          </p>

          <p className="tracking-muted what-if-timestamp">
            {result.assumptions.estimateBasis} · Calculated{" "}
            {date(result.calculatedAt)}
          </p>
        </div>
      )}
    </section>
  );
}
