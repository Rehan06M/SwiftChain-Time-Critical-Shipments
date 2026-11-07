import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  X,
  Clock,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ReceiptText,
  RefreshCw,
  Info,
} from "lucide-react";

import type { Shipment } from "../lib/shipments";
import {
  calculateQuotes,
  confirmBooking,
  type DeliveryQuote,
  type QuoteResponse,
  type Booking,
} from "../lib/commerce";

interface Props {
  shipment: Shipment;
  onClose: () => void;
  onBooked: () => Promise<void>;
}

function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function PricingBooking({
  shipment,
  onClose,
  onBooked,
}: Props) {
  const [specialHandling, setSpecialHandling] = useState(false);
  const [afterHours, setAfterHours] = useState(false);
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const requestQuotes = useCallback(
    async (handling: boolean, after: boolean) => {
      setLoading(true);
      setData(null);
      setError("");

      try {
        const response = await calculateQuotes(shipment.id, {
          specialHandling: handling,
          afterHours: after,
        });

        setData(response);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to calculate prices"
        );
      } finally {
        setLoading(false);
      }
    },
    [shipment.id]
  );

  useEffect(() => {
    void requestQuotes(specialHandling, afterHours);
  }, [requestQuotes, specialHandling, afterHours, revision]);

  async function book(quote: DeliveryQuote) {
    if (bookingId) return;

    const approved = window.confirm(
      `Confirm an internal ${quote.tier} booking with ${quote.carrierName} for ${money(
        quote.price.totalCostInr
      )}?`
    );

    if (!approved) return;

    setBookingId(quote.id);
    setError("");

    try {
      const result = await confirmBooking(quote.id);
      setBooking(result.booking);

      try {
        await onBooked();
      } catch {
        // Confirmation remains visible
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Booking could not be confirmed"
      );
    } finally {
      setBookingId("");
    }
  }

  return (
    <div className="carrier-modal-backdrop">
      <section
        className="carrier-modal pricing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-title"
      >
        <header className="carrier-modal-header">
          <div>
            <span className="section-eyebrow eyebrow-dark">
              SWIFTCHAIN DYNAMIC PRICING
            </span>
            <h2 id="pricing-title">
              {booking ? "Booking Confirmed" : "Delivery Quotes"}
            </h2>
            <p className="tracking-muted">
              Shipment {shipment.trackingCode} · {shipment.originCity} →{" "}
              {shipment.destinationCity}
            </p>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        {booking ? (
          <div className="booking-success-view">
            <div className="booking-success-icon-wrap">
              <CheckCircle2 size={48} />
            </div>

            <h3>Shipment Booking Confirmed</h3>
            <p className="tracking-muted">
              Internal SwiftChain demonstration booking registered successfully.
            </p>

            <div className="booking-success-grid">
              <div className="b-item">
                <span>Booking Reference</span>
                <strong>{booking.id}</strong>
              </div>

              <div className="b-item">
                <span>Carrier</span>
                <strong>{booking.carrierName}</strong>
              </div>

              <div className="b-item">
                <span>Service Tier</span>
                <strong className="tier-tag">{booking.tier.toUpperCase()}</strong>
              </div>

              <div className="b-item">
                <span>Estimated Arrival</span>
                <strong>{dateTime(booking.estimatedArrival)}</strong>
              </div>

              <div className="b-item b-item-cost">
                <span>Confirmed Price</span>
                <strong className="val-cost">{money(booking.totalCostInr)}</strong>
              </div>
            </div>

            <div className="booking-disclaimer-box">
              <Info size={16} />
              <span>
                Internal demonstration booking. External carrier dispatch and live
                payment gateway processing are simulated.
              </span>
            </div>

            <button
              type="button"
              className="primary-button booking-done-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Options bar: Handling & After-Hours */}
            <div className="pricing-options-bar">
              <span className="options-title">Add-on Services:</span>
              <div className="options-checkboxes">
                <label className="checkbox-card">
                  <input
                    type="checkbox"
                    checked={specialHandling}
                    onChange={(e) => setSpecialHandling(e.target.checked)}
                    disabled={Boolean(bookingId)}
                  />
                  <span>Special Handling (+₹450)</span>
                </label>

                <label className="checkbox-card">
                  <input
                    type="checkbox"
                    checked={afterHours}
                    onChange={(e) => setAfterHours(e.target.checked)}
                    disabled={Boolean(bookingId)}
                  />
                  <span>After-Hours Service (+₹600)</span>
                </label>
              </div>
            </div>

            <div className="carrier-toolbar">
              <p className="tracking-muted">
                Quotes are calculated based on simulated carrier tariffs. Quotes
                remain valid for 10 minutes from calculation.
              </p>

              <button
                type="button"
                className="secondary-button"
                disabled={loading || Boolean(bookingId)}
                onClick={() => setRevision((v) => v + 1)}
              >
                <RefreshCw size={15} />
                <span>Recalculate</span>
              </button>
            </div>

            {error && (
              <div className="form-alert" role="alert">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {loading && (
              <div className="carrier-message">
                <RefreshCw size={24} className="spin-icon" />
                <span>Calculating competitive service quotes...</span>
              </div>
            )}

            {!loading && data?.quotes.length === 0 && (
              <div className="carrier-message">
                <AlertTriangle size={28} />
                <h3>No Eligible Delivery Quotes</h3>
                <p>
                  No eligible carrier can service this route and weight profile
                  under the current urgency constraints.
                </p>
              </div>
            )}

            {!loading && data && data.quotes.length > 0 && (
              <div className="quote-grid">
                {data.quotes.map((quote) => (
                  <article key={quote.id} className="quote-card">
                    <div className="quote-heading">
                      <div>
                        <span
                          className={`badge badge-tier tier-${quote.tier.toLowerCase()}`}
                        >
                          {quote.tier.toUpperCase()}
                        </span>
                        <h3>{quote.carrierName}</h3>
                        <p className="quote-mode">
                          {quote.transportMode === "air_ground"
                            ? "Air + Ground Intermodal"
                            : "Ground Transport"}
                        </p>
                      </div>
                      <div className="quote-truck-icon">
                        <Truck size={22} />
                      </div>
                    </div>

                    <div className="quote-total-box">
                      <span className="total-label">Total Committed Cost</span>
                      <strong className="total-amount">
                        {money(quote.price.totalCostInr)}
                      </strong>
                    </div>

                    <div className="quote-eta-row">
                      <Clock size={15} />
                      <span>
                        {duration(quote.estimatedMinutes)} · Arrival:{" "}
                        <strong>{dateTime(quote.estimatedArrival)}</strong>
                      </span>
                    </div>

                    <div className="quote-line-items">
                      <div className="line-row">
                        <span>Base Transportation</span>
                        <strong>{money(quote.price.baseCostInr)}</strong>
                      </div>
                      <div className="line-row">
                        <span>
                          Urgency Surcharge ({quote.price.urgencyPercentage}%)
                        </span>
                        <strong>
                          {money(quote.price.urgencySurchargeInr)}
                        </strong>
                      </div>
                      {quote.price.specialHandlingInr > 0 && (
                        <div className="line-row">
                          <span>Special Handling</span>
                          <strong>
                            {money(quote.price.specialHandlingInr)}
                          </strong>
                        </div>
                      )}
                      {quote.price.afterHoursInr > 0 && (
                        <div className="line-row">
                          <span>After-Hours Service</span>
                          <strong>{money(quote.price.afterHoursInr)}</strong>
                        </div>
                      )}
                    </div>

                    <div
                      className={`quote-feasibility-tag ${
                        quote.meetsDeadline ? "quote-feasible" : "quote-late"
                      }`}
                    >
                      {quote.meetsDeadline ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <AlertTriangle size={15} />
                      )}
                      <span>
                        {quote.meetsDeadline
                          ? "Estimated to meet deadline"
                          : "Estimated to miss deadline"}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="primary-button quote-book-btn"
                      disabled={Boolean(bookingId)}
                      onClick={() => void book(quote)}
                    >
                      <ReceiptText size={16} />
                      <span>
                        {bookingId === quote.id
                          ? "Confirming Booking..."
                          : "Confirm Booking"}
                      </span>
                    </button>
                  </article>
                ))}
              </div>
            )}

            <div className="booking-disclaimer-note">
              <Info size={14} />
              <span>
                Economy, Express, and Critical represent comparison service
                levels. They do not alter carriers' intrinsic transit speeds. No
                payment is processed; all quotes are internal demonstrations.
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
