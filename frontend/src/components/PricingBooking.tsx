
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  X,
  Clock3,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ReceiptText,
  RefreshCw,
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
  return (
    `${Math.floor(minutes / 60)}h ` +
    `${minutes % 60}m`
  );
}

export default function PricingBooking({
  shipment,
  onClose,
  onBooked,
}: Props) {
  const [specialHandling, setSpecialHandling] =
    useState(false);

  const [afterHours, setAfterHours] =
    useState(false);

  const [data, setData] =
    useState<QuoteResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState("");
  const [booking, setBooking] =
    useState<Booking | null>(null);

  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const requestQuotes = useCallback(async (
    handling: boolean,
    after: boolean
  ) => {
    setLoading(true);
    setData(null);
    setError("");

    try {
      const response = await calculateQuotes(
        shipment.id,
        {
          specialHandling: handling,
          afterHours: after,
        }
      );

      setData(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to calculate prices"
      );
    } finally {
      setLoading(false);
    }
  }, [shipment.id]);

  useEffect(() => {
    void requestQuotes(
      specialHandling,
      afterHours
    );
    // The revision value is changed only
    // when the user presses Refresh.
  }, [
    requestQuotes,
    specialHandling,
    afterHours,
    revision,
  ]);

  async function book(quote: DeliveryQuote) {
    if (bookingId) return;

    const approved = window.confirm(
      `Confirm an internal ${quote.tier} booking ` +
      `with ${quote.carrierName} for ` +
      `${money(quote.price.totalCostInr)}?`
    );

    if (!approved) return;

    setBookingId(quote.id);
    setError("");

    try {
      const result = await confirmBooking(
        quote.id
      );

      setBooking(result.booking);

      // Reload the shipment list so it
      // shows the new booked status.
      try {
        await onBooked();
      } catch {
        // Booking is already confirmed.
        // Confirmation remains visible.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Booking could not be confirmed"
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
              {booking
                ? "Booking Confirmed"
                : "Delivery Quotes"}
            </h2>

            <p>{shipment.trackingCode}</p>
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
          <div className="booking-success">
            <CheckCircle2 size={44} />

            <h3>Shipment booking confirmed</h3>

            <p>
              Your internal SwiftChain booking has
              been saved successfully.
            </p>

            <div className="booking-success-details">
              <div>
                <span>Booking Reference</span>
                <strong>{booking.id}</strong>
              </div>

              <div>
                <span>Carrier</span>
                <strong>{booking.carrierName}</strong>
              </div>

              <div>
                <span>Service</span>
                <strong>{booking.tier}</strong>
              </div>

              <div>
                <span>Estimated Arrival</span>
                <strong>
                  {dateTime(booking.estimatedArrival)}
                </strong>
              </div>

              <div>
                <span>Confirmed Price</span>
                <strong>
                  {money(booking.totalCostInr)}
                </strong>
              </div>
            </div>

            <p className="booking-disclaimer">
              This is an internal demonstration
              booking. External carrier acceptance
              and dispatch are not yet integrated.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="pricing-options">
              <label>
                <input
                  type="checkbox"
                  checked={specialHandling}
                  onChange={(e) =>
                    setSpecialHandling(e.target.checked)
                  }
                  disabled={Boolean(bookingId)}
                />
                Special handling (+₹450)
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={afterHours}
                  onChange={(e) =>
                    setAfterHours(e.target.checked)
                  }
                  disabled={Boolean(bookingId)}
                />
                After-hours service (+₹600)
              </label>
            </div>

            <div className="carrier-toolbar">
              <p>
                Pricing is estimated from simulated
                carrier services. Quotes are valid
                for 10 minutes.
              </p>

              <button
                type="button"
                className="secondary-button"
                disabled={loading || Boolean(bookingId)}
                onClick={() =>
                  setRevision((value) => value + 1)
                }
              >
                <RefreshCw size={16} />
                Recalculate
              </button>
            </div>

            {error && (
              <div className="form-alert" role="alert">
                {error}
              </div>
            )}

            {loading && (
              <div className="carrier-message">
                Calculating delivery options...
              </div>
            )}

            {!loading &&
              data?.quotes.length === 0 && (
                <div className="carrier-message">
                  <AlertTriangle size={28} />
                  <h3>No eligible delivery options</h3>
                  <p>
                    No available carrier supports
                    the current shipment route,
                    cargo, and weight.
                  </p>
                </div>
              )}

            {!loading && data && (
              <div className="quote-grid">
                {data.quotes.map((quote) => (
                  <article
                    key={quote.id}
                    className="quote-card"
                  >
                    <div className="quote-heading">
                      <div>
                        <span className="section-eyebrow eyebrow-dark">
                          {quote.tier.toUpperCase()}
                        </span>
                        <h3>{quote.carrierName}</h3>
                        <p>
                          {quote.transportMode ===
                            "air_ground"
                            ? "Air + Ground"
                            : "Ground Transport"}
                        </p>
                      </div>
                      <Truck size={24} />
                    </div>

                    <div className="quote-total">
                      {money(
                        quote.price.totalCostInr
                      )}
                    </div>

                    <div className="quote-eta">
                      <Clock3 size={16} />
                      {duration(
                        quote.estimatedMinutes
                      )}{" "}
                      · {dateTime(
                        quote.estimatedArrival
                      )}
                    </div>

                    <div className="quote-line-items">
                      <div>
                        <span>Base carrier charge</span>
                        <strong>
                          {money(
                            quote.price.baseCostInr
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Urgency surcharge (
                          {quote.price.urgencyPercentage}%)
                        </span>
                        <strong>
                          {money(
                            quote.price
                              .urgencySurchargeInr
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Special handling</span>
                        <strong>
                          {money(
                            quote.price
                              .specialHandlingInr
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>After-hours service</span>
                        <strong>
                          {money(
                            quote.price.afterHoursInr
                          )}
                        </strong>
                      </div>
                    </div>

                    <div
                      className={
                        quote.meetsDeadline
                          ? "quote-feasible"
                          : "quote-late"
                      }
                    >
                      {quote.meetsDeadline ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertTriangle size={16} />
                      )}

                      <span>
                        {quote.meetsDeadline
                          ? "Estimated to meet deadline"
                          : "Estimated to miss deadline"}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="primary-button"
                      disabled={Boolean(bookingId)}
                      onClick={() => void book(quote)}
                    >
                      <ReceiptText size={17} />
                      {bookingId === quote.id
                        ? "Confirming..."
                        : "Confirm Booking"}
                    </button>
                  </article>
                ))}
              </div>
            )}

            <p className="booking-disclaimer">
              Economy, Express, and Critical are
              comparison labels for distinct eligible
              carrier services. They do not change
              the carriers' estimated travel times.
              Not all three may be available.
              No payment or external carrier
              reservation is processed.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
