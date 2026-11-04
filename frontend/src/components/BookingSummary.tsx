
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import {
  getBooking,
  type Booking,
} from "../lib/commerce";

interface Props {
  shipmentId: string;
}

export default function BookingSummary({
  shipmentId,
}: Props) {
  const [booking, setBooking] =
    useState<Booking | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getBooking(shipmentId)
      .then((result) => {
        if (active) {
          setBooking(result.booking);
        }
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

  if (loading) {
    return <p>Loading booking details...</p>;
  }

  if (error) {
    return (
      <p role="alert">
        {error}
      </p>
    );
  }

  if (!booking) return null;

  return (
    <div className="booking-summary">
      <div className="booking-summary-title">
        <CheckCircle2 size={20} />
        <strong>Internal Booking Confirmed</strong>
      </div>

      <p>
        <strong>Carrier:</strong> {booking.carrierName}
      </p>

      <p>
        <strong>Service:</strong> {booking.tier}
      </p>

      <p>
        <strong>Price:</strong>{" "}
        {new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(booking.totalCostInr)}
      </p>

      <p>
        <strong>Estimated Arrival:</strong>{" "}
        {new Date(
          booking.estimatedArrival
        ).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>

      <p>
        External carrier acceptance and dispatch
        are not yet integrated.
      </p>
    </div>
  );
}
