import { useState, type FormEvent } from "react";
import { X, PackagePlus, MapPin, Box, Clock, FileText, AlertTriangle } from "lucide-react";

import {
  type CargoType,
  type Shipment,
  type ShipmentInput,
} from "../lib/shipments";

interface Props {
  shipment?: Shipment | null;
  onSave: (input: ShipmentInput) => Promise<void>;
  onClose: () => void;
}

const cargoTypes: CargoType[] = [
  "medical",
  "aviation",
  "manufacturing",
  "electronics",
  "events",
  "general",
];

function toLocalDateTime(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${d.getFullYear()}-` +
    `${pad(d.getMonth() + 1)}-` +
    `${pad(d.getDate())}T` +
    `${pad(d.getHours())}:` +
    `${pad(d.getMinutes())}`
  );
}

function initialValues(shipment?: Shipment | null) {
  return {
    originCity: shipment?.originCity ?? "",
    originAddress: shipment?.originAddress ?? "",
    destinationCity: shipment?.destinationCity ?? "",
    destinationAddress: shipment?.destinationAddress ?? "",
    cargoDescription: shipment?.cargoDescription ?? "",
    cargoType: shipment?.cargoType ?? ("manufacturing" as CargoType),
    weightKg: String(shipment?.weightKg ?? ""),
    deadline: shipment ? toLocalDateTime(shipment.deadline) : "",
    delayCostPerHour: String(shipment?.delayCostPerHour ?? ""),
    notes: shipment?.notes ?? "",
  };
}

export default function ShipmentForm({ shipment, onSave, onClose }: Props) {
  const [form, setForm] = useState(() => initialValues(shipment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function change(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const deadlineTime = new Date(form.deadline).getTime();

    if (!Number.isFinite(deadlineTime) || deadlineTime <= Date.now()) {
      setError("Please choose a future delivery deadline.");
      return;
    }

    const weight = Number(form.weightKg);
    const delayCost = Number(form.delayCostPerHour);

    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      !Number.isFinite(delayCost) ||
      delayCost < 0
    ) {
      setError("Please enter a valid weight (> 0 kg) and delay cost (≥ 0).");
      return;
    }

    const input: ShipmentInput = {
      originCity: form.originCity.trim(),
      originAddress: form.originAddress.trim(),
      destinationCity: form.destinationCity.trim(),
      destinationAddress: form.destinationAddress.trim(),
      cargoDescription: form.cargoDescription.trim(),
      cargoType: form.cargoType,
      weightKg: weight,
      deadline: new Date(deadlineTime).toISOString(),
      delayCostPerHour: delayCost,
      notes: form.notes.trim(),
    };

    setSaving(true);

    try {
      await onSave(input);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save shipment request"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shipment-form-overlay">
      <section
        className="shipment-form-panel"
        aria-labelledby="shipment-form-title"
      >
        <div className="shipment-form-header">
          <div>
            <span className="section-eyebrow eyebrow-dark">
              SHIPPER DISPATCH CONSOLE
            </span>
            <h2 id="shipment-form-title">
              {shipment ? "Edit Shipment Request" : "New Time-Critical Shipment"}
            </h2>
          </div>

          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close form"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="shipment-modal-form">
          {error && (
            <div className="form-alert" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Group 1: Route Coordinates & Locations */}
          <fieldset className="form-section-group">
            <legend className="form-legend">
              <MapPin size={16} />
              <span>Route & Locations</span>
            </legend>

            <div className="form-grid-2col">
              <label className="form-field">
                <span className="field-label">
                  Pickup City <span className="req-star">*</span>
                </span>
                <input
                  value={form.originCity}
                  onChange={(e) => change("originCity", e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="e.g. Pune"
                  disabled={saving}
                />
              </label>

              <label className="form-field">
                <span className="field-label">
                  Destination City <span className="req-star">*</span>
                </span>
                <input
                  value={form.destinationCity}
                  onChange={(e) => change("destinationCity", e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="e.g. Mumbai"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="form-grid-2col">
              <label className="form-field">
                <span className="field-label">
                  Pickup Address <span className="req-star">*</span>
                </span>
                <textarea
                  value={form.originAddress}
                  onChange={(e) => change("originAddress", e.target.value)}
                  required
                  minLength={2}
                  maxLength={500}
                  rows={2}
                  placeholder="Warehouse, facility, or street address"
                  disabled={saving}
                />
              </label>

              <label className="form-field">
                <span className="field-label">
                  Delivery Address <span className="req-star">*</span>
                </span>
                <textarea
                  value={form.destinationAddress}
                  onChange={(e) => change("destinationAddress", e.target.value)}
                  required
                  minLength={2}
                  maxLength={500}
                  rows={2}
                  placeholder="Destination dock, receiver, or plant"
                  disabled={saving}
                />
              </label>
            </div>
          </fieldset>

          {/* Group 2: Cargo Specifications */}
          <fieldset className="form-section-group">
            <legend className="form-legend">
              <Box size={16} />
              <span>Cargo Specifications</span>
            </legend>

            <div className="form-grid-1col">
              <label className="form-field">
                <span className="field-label">
                  Cargo Description <span className="req-star">*</span>
                </span>
                <input
                  value={form.cargoDescription}
                  onChange={(e) => change("cargoDescription", e.target.value)}
                  required
                  minLength={2}
                  maxLength={255}
                  placeholder="e.g. Critical aerospace turbine assembly component"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="form-grid-2col">
              <label className="form-field">
                <span className="field-label">
                  Cargo Category <span className="req-star">*</span>
                </span>
                <select
                  value={form.cargoType}
                  onChange={(e) => change("cargoType", e.target.value)}
                  disabled={saving}
                >
                  {cargoTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="field-label">
                  Total Weight (kg) <span className="req-star">*</span>
                </span>
                <input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={form.weightKg}
                  onChange={(e) => change("weightKg", e.target.value)}
                  required
                  placeholder="e.g. 45"
                  disabled={saving}
                />
              </label>
            </div>
          </fieldset>

          {/* Group 3: Delivery Deadline & Business Impact */}
          <fieldset className="form-section-group">
            <legend className="form-legend">
              <Clock size={16} />
              <span>Deadline & Financial Impact</span>
            </legend>

            <div className="form-grid-2col">
              <label className="form-field">
                <span className="field-label">
                  Required Delivery Deadline <span className="req-star">*</span>
                </span>
                <input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(e) => change("deadline", e.target.value)}
                  required
                  disabled={saving}
                />
                <small className="field-hint">Must be a future timestamp</small>
              </label>

              <label className="form-field">
                <span className="field-label">
                  Cost of Delay (₹ / hour) <span className="req-star">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={form.delayCostPerHour}
                  onChange={(e) => change("delayCostPerHour", e.target.value)}
                  required
                  placeholder="e.g. 250000"
                  disabled={saving}
                />
                <small className="field-hint">Used to calculate SLA financial risk exposure</small>
              </label>
            </div>
          </fieldset>

          {/* Group 4: Special Instructions */}
          <fieldset className="form-section-group">
            <legend className="form-legend">
              <FileText size={16} />
              <span>Special Handling & Notes (Optional)</span>
            </legend>

            <div className="form-grid-1col">
              <label className="form-field">
                <span className="field-label">Handling Requirements or Gate Instructions</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="e.g. Temperature-sensitive packaging. Security gate clearance code: 4921."
                  disabled={saving}
                />
              </label>
            </div>
          </fieldset>

          <div className="shipment-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button form-submit"
              disabled={saving}
            >
              <PackagePlus size={18} />
              <span>
                {saving
                  ? "Saving Shipment..."
                  : shipment
                    ? "Save Changes"
                    : "Create Shipment"}
              </span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
