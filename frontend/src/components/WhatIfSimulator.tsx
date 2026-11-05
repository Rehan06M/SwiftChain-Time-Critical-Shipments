import { apiRequest } from "../lib/api";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

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
  new Date(value).toLocaleString("en-IN");

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
          "Risk",
          result.baseline.riskStatus,
          result.scenario.riskStatus,
        ],
        [
          "Remaining time",
          `${Math.ceil(result.baseline.remainingMinutes)} min`,
          `${Math.ceil(result.scenario.remainingMinutes)} min`,
        ],
        [
          "Deadline buffer",
          `${Math.round(result.baseline.slackMinutes)} min`,
          `${Math.round(result.scenario.slackMinutes)} min`,
        ],
        [
          "Predicted late by",
          `${Math.ceil(result.baseline.lateByMinutes)} min`,
          `${Math.ceil(result.scenario.lateByMinutes)} min`,
        ],
        [
          "Delay exposure",
          money(result.baseline.delayExposureInr),
          money(result.scenario.delayExposureInr),
        ],
      ]
    : [];

  return (
    <section className="what-if-panel">
      <div className="role-dashboard-toolbar">
        <div>
          <h3>What-If Logistics Simulator</h3>
          <p className="tracking-muted">
            Preview only. No shipment, deadline, booking or alert is changed.
          </p>
        </div>
      </div>

      <div className="tracking-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => preset("1", "60", "0")}
        >
          Demo: 60-minute delay
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => preset("0.75", "0", "0")}
        >
          Demo: 25% slower travel
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => preset("1.5", "0", "1500")}
        >
          Demo: faster travel, +₹1,500
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => preset("1", "0", "0")}
        >
          Reset assumptions
        </button>
      </div>

      <form className="what-if-form" onSubmit={run}>
        <label>
          Travel speed multiplier
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
          <small>1 = unchanged, 0.75 = slower, 1.5 = faster</small>
        </label>

        <label>
          Additional delay — minutes
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
        </label>

        <label>
          Hypothetical deadline shift — minutes
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
          <small>Positive extends; negative tightens the deadline</small>
        </label>

        <label>
          Hypothetical additional cost — INR
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
        </label>

        <button
          type="submit"
          className="primary-button"
          disabled={busy}
        >
          {busy ? "Calculating..." : "Compare scenario"}
        </button>
      </form>

      {error && <p className="form-alert" role="alert">{error}</p>}

      {result && (
        <>
          {result.locationStale && (
            <p className="form-alert">
              Location is missing or stale. Both estimates depend on
              the last known position.
            </p>
          )}

          <div className="role-dashboard-scroll">
            <table className="role-dashboard-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Current estimate</th>
                  <th>Hypothetical scenario</th>
                </tr>
              </thead>

              <tbody>
                {rows.map(([metric, baseline, scenario]) => (
                  <tr key={metric}>
                    <th>{metric}</th>
                    <td>{baseline}</td>
                    <td>{scenario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            Additional scenario cost:{" "}
            <strong>{money(result.additionalCostInr)}</strong>
          </p>

          <p>
            Hypothetical exposure reduction minus additional cost:{" "}
            <strong>
              {money(result.hypotheticalNetBenefitInr)}
            </strong>
          </p>

          <p className="tracking-muted">
            This is a comparison of assumptions, not guaranteed savings.
            A hypothetical deadline change does not renegotiate the
            actual SLA. Actual carrier changes still require recovery
            approval.
          </p>

          <p className="tracking-muted">
            {result.assumptions.estimateBasis}
            {" · "}Calculated {date(result.calculatedAt)}
          </p>
        </>
      )}
    </section>
  );
}