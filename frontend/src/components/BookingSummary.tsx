import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import {
  getBooking,
  type Booking,
} from "../lib/commerce";

interface Props {
  shipmentId: string;
}

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function BookingSummary({
  shipmentId,
}: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    setBooking(null);
    setError("");
    setLoading(true);

    getBooking(shipmentId)
      .then((result) => {
        if (active) setBooking(result.booking);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load booking"
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shipmentId]);

  if (loading) return <p>Loading booking details...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!booking) return null;

  const recovered = booking.recoveryCount > 0;

  return (
    <div className="booking-summary">
      <div className="booking-summary-title">
        <CheckCircle2 size={20} />
        <strong>
          {recovered
            ? "Internal Booking — Recovery Applied"
            : "Internal Booking Confirmed"}
        </strong>
      </div>

      <p>
        <strong>Current carrier:</strong>{" "}
        {booking.carrierName}
      </p>

      <p>
        <strong>Original service tier:</strong>{" "}
        {booking.tier}
      </p>

      <p>
        <strong>Original booking:</strong>{" "}
        {formatMoney(booking.originalCostInr)}
      </p>

      {recovered && (
        <>
          <p>
            <strong>Approved recoveries:</strong>{" "}
            {booking.recoveryCount}
          </p>

          <p>
            <strong>Additional recovery charges:</strong>{" "}
            {formatMoney(booking.recoveryCostInr)}
          </p>
        </>
      )}

      <p>
        <strong>Total committed cost:</strong>{" "}
        {formatMoney(booking.totalCostInr)}
      </p>

      <p>
        <strong>Booking estimated arrival:</strong>{" "}
        {new Date(
          booking.estimatedArrival
        ).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>

      {recovered && (
        <p className="tracking-muted">
          The original service tier describes the initial
          purchase. Recovery charges are additional, with
          no refund of the original booking.
        </p>
      )}

      <p className="tracking-muted">
        Check the tracking ETA panel for the latest prediction.
        External carrier acceptance and dispatch are not yet
        integrated.
      </p>
    </div>
  );
}