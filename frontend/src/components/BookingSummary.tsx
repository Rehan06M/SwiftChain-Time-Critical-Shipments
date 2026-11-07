import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { getBooking, type Booking } from "../lib/commerce";

interface Props {
  shipmentId: string;
}

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function BookingSummary({ shipmentId }: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    queueMicrotask(() => {
      if (!active) return;

      setBooking(null);
      setError("");
      setLoading(true);
    });


    async function refreshBooking(initial = false) {
      if (requestInProgress) return;

      requestInProgress = true;

      try {
        const result = await getBooking(shipmentId);

        if (!active) return;

        setBooking(result.booking);
        setError("");
      } catch (err) {
        if (!active) return;

        // Keep the last successful booking visible
        // if a background refresh fails.
        if (initial) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load booking"
          );
        }
      } finally {
        requestInProgress = false;

        if (active && initial) {
          setLoading(false);
        }
      }
    }

    void refreshBooking(true);

    // Refresh carrier, arrival, and recovery costs
    // while the booking panel remains open.
    const refreshTimer = window.setInterval(() => {
      void refreshBooking();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [shipmentId]);


  if (loading) {
    return (
      <div className="booking-summary-loading">
        <span className="tracking-muted">Loading confirmed booking telemetry...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="form-alert" role="alert">
        <AlertTriangle size={16} />
        <span>{error}</span>
      </div>
    );
  }

  if (!booking) return null;

  const recovered = booking.recoveryCount > 0;

  return (
    <div className="booking-summary-card">
      <div className="booking-summary-title">
        <div className="title-icon">
          <CheckCircle2 size={18} />
        </div>
        <strong>
          {recovered
            ? "Internal Booking — Active Recovery Applied"
            : "Internal Booking Confirmed"}
        </strong>
      </div>

      <div className="booking-summary-grid">
        <div className="summary-field">
          <span className="summary-label">Current Active Carrier</span>
          <strong className="summary-val">{booking.carrierName}</strong>
        </div>

        <div className="summary-field">
          <span className="summary-label">Original Service Tier</span>
          <strong className="summary-val tier-badge">
            {booking.tier.toUpperCase()}
          </strong>
        </div>

        <div className="summary-field">
          <span className="summary-label">Original Booking Commitment</span>
          <strong className="summary-val">
            {formatMoney(booking.originalCostInr)}
          </strong>
        </div>

        {recovered && (
          <>
            <div className="summary-field">
              <span className="summary-label">Approved Recoveries</span>
              <strong className="summary-val val-highlight">
                {booking.recoveryCount} event{booking.recoveryCount > 1 ? "s" : ""}
              </strong>
            </div>

            <div className="summary-field">
              <span className="summary-label">Additional Recovery Surcharges</span>
              <strong className="summary-val val-cost">
                +{formatMoney(booking.recoveryCostInr)}
              </strong>
            </div>
          </>
        )}

        <div className="summary-field summary-field-total">
          <span className="summary-label">Total Committed Cost</span>
          <strong className="summary-val val-total">
            {formatMoney(booking.totalCostInr)}
          </strong>
        </div>

        <div className="summary-field">
          <span className="summary-label">Scheduled Arrival Target</span>
          <strong className="summary-val">
            {new Date(booking.estimatedArrival).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </strong>
        </div>
      </div>

      {recovered && (
        <div className="summary-disclaimer">
          <Info size={14} />
          <span>
            Original booking fees remain committed and are non-refundable.
            Approved recovery costs represent additional contracted intervention
            charges.
          </span>
        </div>
      )}

      <p className="tracking-muted summary-footer-text">
        Check the tracking ETA telemetry card for real-time progress updates.
        External carrier dispatch is internally simulated.
      </p>
    </div>
  );
}
