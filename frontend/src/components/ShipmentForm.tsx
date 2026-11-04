
import { useState, type FormEvent } from "react";
import { X, PackagePlus } from "lucide-react";

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

  const pad = (n: number) =>
    String(n).padStart(2, "0");

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
    cargoType: shipment?.cargoType ?? "manufacturing" as CargoType,
    weightKg: String(shipment?.weightKg ?? ""),
    deadline: shipment
      ? toLocalDateTime(shipment.deadline)
      : "",
    delayCostPerHour: String(
      shipment?.delayCostPerHour ?? ""
    ),
    notes: shipment?.notes ?? "",
  };
}

export default function ShipmentForm({
  shipment,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState(
    () => initialValues(shipment)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function change(
    key: keyof typeof form,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const deadlineTime = new Date(
      form.deadline
    ).getTime();

    if (
      !Number.isFinite(deadlineTime) ||
      deadlineTime <= Date.now()
    ) {
      setError("Choose a future delivery deadline.");
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
      setError("Check weight and delay cost.");
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
        err instanceof Error
          ? err.message
          : "Unable to save shipment"
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
              SHIPMENT MANAGEMENT
            </span>

            <h2 id="shipment-form-title">
              {shipment
                ? "Edit Shipment"
                : "Create Shipment"}
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

        <form onSubmit={submit}>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

          <div className="shipment-form-grid">
            <label>
              Pickup City
              <input
                value={form.originCity}
                onChange={(e) =>
                  change("originCity", e.target.value)
                }
                required
                minLength={2}
                maxLength={120}
                placeholder="Pune"
              />
            </label>

            <label>
              Destination City
              <input
                value={form.destinationCity}
                onChange={(e) =>
                  change("destinationCity", e.target.value)
                }
                required
                minLength={2}
                maxLength={120}
                placeholder="Mumbai"
              />
            </label>

            <label>
              Pickup Address
              <textarea
                value={form.originAddress}
                onChange={(e) =>
                  change("originAddress", e.target.value)
                }
                required
                minLength={2}
                maxLength={500}
                rows={3}
                placeholder="Full pickup address"
              />
            </label>

            <label>
              Delivery Address
              <textarea
                value={form.destinationAddress}
                onChange={(e) =>
                  change("destinationAddress", e.target.value)
                }
                required
                minLength={2}
                maxLength={500}
                rows={3}
                placeholder="Full destination address"
              />
            </label>

            <label className="form-wide">
              Cargo Description
              <input
                value={form.cargoDescription}
                onChange={(e) =>
                  change("cargoDescription", e.target.value)
                }
                required
                minLength={2}
                maxLength={255}
                placeholder="Emergency machine replacement component"
              />
            </label>

            <label>
              Cargo Type
              <select
                value={form.cargoType}
                onChange={(e) =>
                  change("cargoType", e.target.value)
                }
              >
                {cargoTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() +
                      type.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Weight (kg)
              <input
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                value={form.weightKg}
                onChange={(e) =>
                  change("weightKg", e.target.value)
                }
                required
                placeholder="25"
              />
            </label>

            <label>
              Required Delivery Deadline
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) =>
                  change("deadline", e.target.value)
                }
                required
              />
            </label>

            <label>
              Cost of Delay (₹/hour)
              <input
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                value={form.delayCostPerHour}
                onChange={(e) =>
                  change("delayCostPerHour", e.target.value)
                }
                required
                placeholder="500000"
              />
            </label>

            <label className="form-wide">
              Special Instructions (optional)
              <textarea
                value={form.notes}
                onChange={(e) =>
                  change("notes", e.target.value)
                }
                rows={3}
                maxLength={2000}
                placeholder="Handling requirements or important notes"
              />
            </label>
          </div>

          <div className="shipment-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button form-submit"
              disabled={saving}
            >
              <PackagePlus size={18} />
              {saving
                ? "Saving..."
                : shipment
                  ? "Save Changes"
                  : "Create Shipment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
