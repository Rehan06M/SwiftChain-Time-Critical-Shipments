import { db } from "../config/db.js";
import { distanceKm, predictETA } from "./eta.service.js";

export class ShipmentETAError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ShipmentETAError";
  }
}

// ownerId is required for user-facing requests.
// The internal monitoring worker can omit it.
export async function evaluateShipmentETA(
  shipmentId: string,
  ownerId?: string
) {
  const result = await db.query(
    `
      SELECT
        s.id,
        s.created_by,
        s.status,
        s.deadline,
        s.origin_latitude::float8 AS origin_latitude,
        s.origin_longitude::float8 AS origin_longitude,
        s.destination_latitude::float8 AS destination_latitude,
        s.destination_longitude::float8 AS destination_longitude,
        lane.pickup_minutes,
        lane.transit_minutes,
        location.latitude::float8 AS current_latitude,
        location.longitude::float8 AS current_longitude,
        location.occurred_at AS location_recorded_at,
        milestone.milestone
      FROM public.shipments s
      LEFT JOIN public.shipment_bookings booking
        ON booking.shipment_id = s.id
      LEFT JOIN public.carrier_service_lanes lane
        ON lane.id = booking.carrier_lane_id
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, occurred_at
        FROM public.shipment_tracking_events
        WHERE shipment_id = s.id
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1
      ) location ON TRUE
      LEFT JOIN LATERAL (
        SELECT milestone
        FROM public.shipment_tracking_events
        WHERE shipment_id = s.id
          AND event_type = 'milestone'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1
      ) milestone ON TRUE
      WHERE s.id = $1
        AND ($2::uuid IS NULL OR s.created_by = $2::uuid)
    `,
    [shipmentId, ownerId ?? null]
  );

  const shipment = result.rows[0];

  if (!shipment) {
    throw new ShipmentETAError("Shipment not found", 404);
  }

  if (shipment.milestone === "delivered") {
    return {
      status: "delivered" as const,
      prediction: null,
    };
  }

  if (shipment.status !== "booked") {
    throw new ShipmentETAError(
      "ETA requires a booked shipment",
      409
    );
  }

  const coordinates = [
    shipment.origin_latitude,
    shipment.origin_longitude,
    shipment.destination_latitude,
    shipment.destination_longitude,
  ];

  if (
    coordinates.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value)
    )
  ) {
    throw new ShipmentETAError(
      "Save route coordinates by starting a simulation first",
      409
    );
  }

  if (
    !shipment.transit_minutes ||
    shipment.transit_minutes <= 0
  ) {
    throw new ShipmentETAError(
      "The booked carrier lane has no valid transit time",
      409
    );
  }

  const fullDistance = distanceKm(
    shipment.origin_latitude,
    shipment.origin_longitude,
    shipment.destination_latitude,
    shipment.destination_longitude
  );

  if (fullDistance < 0.01) {
    throw new ShipmentETAError(
      "Pickup and destination coordinates must differ",
      409
    );
  }

  const remainingDistance = distanceKm(
    shipment.current_latitude ?? shipment.origin_latitude,
    shipment.current_longitude ?? shipment.origin_longitude,
    shipment.destination_latitude,
    shipment.destination_longitude
  );

  const effectiveSpeed =
    fullDistance / (shipment.transit_minutes / 60);

  if (effectiveSpeed <= 0 || effectiveSpeed > 1000) {
    throw new ShipmentETAError(
      "Route coordinates and lane transit time are inconsistent",
      409
    );
  }

  const prediction = await predictETA({
    shipment_id: shipment.id,
    deadline: new Date(shipment.deadline).toISOString(),
    remaining_distance_km: remainingDistance,
    average_speed_kmh: effectiveSpeed,
    pickup_minutes:
      !shipment.location_recorded_at &&
      (!shipment.milestone ||
        shipment.milestone === "booked")
        ? shipment.pickup_minutes
        : 0,
  });

  return {
    status: "active" as const,
    prediction,
    remainingDistanceKm:
      Math.round(remainingDistance * 100) / 100,
    locationRecordedAt: shipment.location_recorded_at,
    locationStale: shipment.location_recorded_at
      ? Date.now() -
          new Date(shipment.location_recorded_at).getTime() >
        120_000
      : true,
    estimateBasis:
      "Straight-line distance calibrated to booked lane transit time",
  };
}