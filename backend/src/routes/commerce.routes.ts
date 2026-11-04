
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { db } from "../config/db.js";

import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middleware/auth.js";

import {
  calculateUrgency,
} from "../services/urgency.service.js";

import {
  matchCarriers,
  type CarrierMatch,
  type CarrierService,
} from "../services/carrier-matching.service.js";

import {
  calculatePrice,
} from "../services/pricing.service.js";

import {
  pricingConfig,
} from "../config/pricing.config.js";

const router = Router();

router.use(requireAuth, requireRole("shipper"));

const optionsSchema = z.object({
  specialHandling: z.boolean().default(false),
  afterHours: z.boolean().default(false),
});

const bookingSchema = z.object({
  quoteId: z.uuid(),
});

class BookingError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

const shipmentQuery = `
  SELECT
    id,
    tracking_code AS "trackingCode",
    created_by AS "createdBy",
    origin_city AS "originCity",
    destination_city AS "destinationCity",
    cargo_type AS "cargoType",
    weight_kg::float8 AS "weightKg",
    deadline,
    delay_cost_per_hour::float8 AS "delayCostPerHour",
    updated_at AS "updatedAt",
    status
  FROM public.shipments
`;

const lanesQuery = `
  SELECT
    l.id AS "laneId",
    c.id AS "carrierId",
    c.name AS "carrierName",
    c.contact_email AS "contactEmail",
    c.on_time_percentage::float8
      AS "onTimePercentage",
    c.max_weight_kg::float8 AS "maxWeightKg",
    c.supported_cargo_types
      AS "supportedCargoTypes",
    c.is_active AS "carrierActive",
    l.is_available AS "laneAvailable",
    l.origin_city AS "originCity",
    l.destination_city AS "destinationCity",
    l.transport_mode AS "transportMode",
    l.pickup_minutes AS "pickupMinutes",
    l.transit_minutes AS "transitMinutes",
    l.base_cost_inr::float8 AS "baseCostInr",
    l.cost_per_kg_inr::float8 AS "costPerKgInr"
  FROM public.carrier_service_lanes l
  JOIN public.carriers c
    ON c.id = l.carrier_id
  WHERE LOWER(TRIM(l.origin_city)) =
        LOWER(TRIM($1))
    AND LOWER(TRIM(l.destination_city)) =
        LOWER(TRIM($2))
`;

function selectTiers(matches: CarrierMatch[]) {
  if (!matches.length) {
    return [];
  }

  // Economy: lowest estimated transportation cost.
  const cheapest = [...matches].sort(
    (a, b) =>
      a.estimatedCostInr - b.estimatedCostInr ||
      a.estimatedMinutes - b.estimatedMinutes
  )[0];

  let remaining = matches.filter(
    (m) => m.laneId !== cheapest.laneId
  );

  // Critical: fastest feasible available service.
  // If none are feasible, show the fastest
  // remaining option with its late warning.
  const critical = [...remaining].sort(
    (a, b) =>
      Number(b.meetsDeadline) -
        Number(a.meetsDeadline) ||
      a.estimatedMinutes - b.estimatedMinutes
  )[0];

  remaining = remaining.filter(
    (m) => m.laneId !== critical?.laneId
  );

  // Express: highest-ranked remaining option.
  const express = [...remaining].sort(
    (a, b) =>
      b.matchingScore - a.matchingScore ||
      a.estimatedMinutes - b.estimatedMinutes
  )[0];

  const selected: {
    tier: "Economy" | "Express" | "Critical";
    match: CarrierMatch;
  }[] = [
    { tier: "Economy", match: cheapest },
  ];

  if (express) {
    selected.push({
      tier: "Express",
      match: express,
    });
  }

  if (critical) {
    selected.push({
      tier: "Critical",
      match: critical,
    });
  }

  return selected;
}

// CREATE ITEMIZED QUOTES FOR A SHIPMENT
router.post(
  "/quotes/:shipmentId",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);
    const options = optionsSchema.safeParse(req.body);

    if (!id.success || !options.success) {
      res.status(400).json({
        message: "Invalid quotation request",
      });
      return;
    }

    try {
      const shipmentResult = await db.query(
        `
          ${shipmentQuery}
          WHERE id = $1 AND created_by = $2
        `,
        [id.data, req.authUser!.id]
      );

      const shipment = shipmentResult.rows[0];

      if (!shipment) {
        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      if (shipment.status !== "created") {
        res.status(409).json({
          message: "Only created shipments can be quoted",
        });
        return;
      }

      const now = new Date();

      const urgency = calculateUrgency(
        {
          deadline: shipment.deadline,
          delayCostPerHour: shipment.delayCostPerHour,
          cargoType: shipment.cargoType,
        },
        now
      );

      const lanes = await db.query(
        lanesQuery,
        [
          shipment.originCity,
          shipment.destinationCity,
        ]
      );

      const matches = matchCarriers(
        {
          id: shipment.id,
          originCity: shipment.originCity,
          destinationCity: shipment.destinationCity,
          cargoType: shipment.cargoType,
          weightKg: shipment.weightKg,
          deadline: shipment.deadline,
          urgencyScore: urgency.score,
        },
        lanes.rows as CarrierService[],
        now
      );

      const selected = selectTiers(matches);

      const quotes = [];

      for (const { tier, match } of selected) {
        const price = calculatePrice({
          baseCarrierCostInr:
            match.estimatedCostInr,
          urgencyScore: urgency.score,
          specialHandling:
            options.data.specialHandling,
          afterHours: options.data.afterHours,
        });

        const quoteId = randomUUID();

        const expiresAt = new Date(
          now.getTime() +
          pricingConfig.quoteValidityMinutes *
            60_000
        );

        await db.query(
          `
            INSERT INTO public.pricing_quotes (
              id,
              shipment_id,
              carrier_lane_id,
              created_by,
              service_tier,
              base_cost_inr,
              urgency_surcharge_inr,
              special_handling_inr,
              after_hours_inr,
              total_cost_inr,
              urgency_score,
              urgency_percentage,
              estimated_minutes,
              estimated_arrival,
              meets_deadline,
              shipment_updated_at,
              created_at,
              expires_at
            )
            VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15,
              $16, $17, $18
            )
          `,
          [
            quoteId,
            shipment.id,
            match.laneId,
            req.authUser!.id,
            tier,
            price.baseCostInr,
            price.urgencySurchargeInr,
            price.specialHandlingInr,
            price.afterHoursInr,
            price.totalCostInr,
            urgency.score,
            price.urgencyPercentage,
            match.estimatedMinutes,
            match.estimatedArrival,
            match.meetsDeadline,
            shipment.updatedAt,
            now,
            expiresAt,
          ]
        );

        quotes.push({
          id: quoteId,
          tier,
          carrierName: match.carrierName,
          carrierLaneId: match.laneId,
          transportMode: match.transportMode,
          reliability: match.reliability,
          matchingScore: match.matchingScore,
          estimatedMinutes: match.estimatedMinutes,
          estimatedArrival: match.estimatedArrival,
          meetsDeadline: match.meetsDeadline,
          minutesBeforeDeadline:
            match.minutesBeforeDeadline,
          price,
          expiresAt: expiresAt.toISOString(),
        });
      }

      res.setHeader("Cache-Control", "no-store");

      res.json({
        shipmentId: shipment.id,
        urgencyScore: urgency.score,
        urgencyLevel: urgency.level,
        estimatedOnly: true,
        quotes,
      });
    } catch (error) {
      console.error("Quotation error:", error);

      res.status(500).json({
        message: "Unable to generate quotations",
      });
    }
  }
);

// CONFIRM AN INTERNAL SHIPMENT BOOKING
router.post(
  "/bookings",
  async (req: AuthRequest, res) => {
    const parsed = bookingSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid booking request",
      });
      return;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const quoteResult = await client.query(
        `
          SELECT *
          FROM public.pricing_quotes
          WHERE id = $1 AND created_by = $2
          FOR UPDATE
        `,
        [parsed.data.quoteId, req.authUser!.id]
      );

      const quote = quoteResult.rows[0];

      if (!quote) {
        throw new BookingError(
          404,
          "Quote not found"
        );
      }

      const shipmentResult = await client.query(
        `
          SELECT *
          FROM public.shipments
          WHERE id = $1 AND created_by = $2
          FOR UPDATE
        `,
        [quote.shipment_id, req.authUser!.id]
      );

      const shipment = shipmentResult.rows[0];

      if (!shipment) {
        throw new BookingError(
          404,
          "Shipment not found"
        );
      }

      if (shipment.status !== "created") {
        throw new BookingError(
          409,
          "Shipment has already been booked or cancelled"
        );
      }

      const now = new Date();

      if (new Date(quote.expires_at) <= now) {
        throw new BookingError(
          409,
          "Quote has expired. Please calculate a new quote."
        );
      }

      // Editing the shipment invalidates old quotes.
      if (
        new Date(shipment.updated_at).getTime() !==
        new Date(quote.shipment_updated_at).getTime()
      ) {
        throw new BookingError(
          409,
          "Shipment details changed. Please calculate a new quote."
        );
      }

      const laneResult = await client.query(
        `
          SELECT l.*, c.is_active,
                 c.max_weight_kg,
                 c.supported_cargo_types,
                 c.name AS carrier_name
          FROM public.carrier_service_lanes l
          JOIN public.carriers c
            ON c.id = l.carrier_id
          WHERE l.id = $1
          FOR UPDATE OF l, c
        `,
        [quote.carrier_lane_id]
      );

      const lane = laneResult.rows[0];

      if (
        !lane ||
        !lane.is_active ||
        !lane.is_available ||
        Number(shipment.weight_kg) >
          Number(lane.max_weight_kg) ||
        !lane.supported_cargo_types.includes(
          shipment.cargo_type
        ) ||
        lane.origin_city.trim().toLowerCase() !==
          shipment.origin_city.trim().toLowerCase() ||
        lane.destination_city.trim().toLowerCase() !==
          shipment.destination_city.trim().toLowerCase()
      ) {
        throw new BookingError(
          409,
          "Carrier is no longer eligible or available. Please re-quote."
        );
      }

      // ETA is recalculated at confirmation.
      // Never silently preserve an outdated ETA.
      const arrival = new Date(
        now.getTime() +
        Number(quote.estimated_minutes) * 60_000
      );

      if (
        quote.meets_deadline &&
        arrival > new Date(shipment.deadline)
      ) {
        throw new BookingError(
          409,
          "This option can no longer meet the deadline. Please re-quote."
        );
      }

      const bookingId = randomUUID();

      await client.query(
        `
          INSERT INTO public.shipment_bookings (
            id, shipment_id, quote_id,
            carrier_lane_id, created_by,
            total_cost_inr, estimated_arrival
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          bookingId,
          shipment.id,
          quote.id,
          lane.id,
          req.authUser!.id,
          quote.total_cost_inr,
          arrival,
        ]
      );

      await client.query(
        `
          UPDATE public.shipments
          SET status = 'booked',
              updated_at = NOW()
          WHERE id = $1
        `,
        [shipment.id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        message: "Internal booking confirmed",
        booking: {
          id: bookingId,
          shipmentId: shipment.id,
          trackingCode: shipment.tracking_code,
          carrierName: lane.carrier_name,
          tier: quote.service_tier,
          totalCostInr: Number(
            quote.total_cost_inr
          ),
          estimatedArrival:
            arrival.toISOString(),
          status: "confirmed",
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if (error instanceof BookingError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      // Unique shipment constraint protects
      // against concurrent duplicate bookings.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({
          message: "Shipment is already booked",
        });
        return;
      }

      console.error("Booking error:", error);

      res.status(500).json({
        message: "Unable to confirm booking",
      });
    } finally {
      client.release();
    }
  }
);

// FETCH AN EXISTING BOOKING
router.get(
  "/bookings/:shipmentId",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(
      req.params.shipmentId
    );

    if (!id.success) {
      res.status(400).json({
        message: "Invalid shipment ID",
      });
      return;
    }

    try {
      const result = await db.query(
        `
          SELECT
            b.id,
            b.shipment_id AS "shipmentId",
            c.name AS "carrierName",
            q.service_tier AS "tier",
            b.total_cost_inr::float8
              AS "totalCostInr",
            b.estimated_arrival AS "estimatedArrival",
            b.status,
            b.created_at AS "createdAt",
            q.total_cost_inr::float8 AS "originalCostInr",

COALESCE(
  (
    SELECT SUM(action.additional_cost_inr)
    FROM public.shipment_recovery_actions action
    WHERE action.shipment_id = b.shipment_id
  ),
  0
)::float8 AS "recoveryCostInr",

(
  SELECT COUNT(*)::integer
  FROM public.shipment_recovery_actions action
  WHERE action.shipment_id = b.shipment_id
) AS "recoveryCount"
          FROM public.shipment_bookings b
          JOIN public.pricing_quotes q
            ON q.id = b.quote_id
          JOIN public.carrier_service_lanes l
            ON l.id = b.carrier_lane_id
          JOIN public.carriers c
            ON c.id = l.carrier_id
          WHERE b.shipment_id = $1
            AND b.created_by = $2
        `,
        [id.data, req.authUser!.id]
      );

      if (!result.rows[0]) {
        res.status(404).json({
          message: "Booking not found",
        });
        return;
      }

      res.setHeader("Cache-Control", "no-store");

      res.json({
        booking: result.rows[0],
      });
    } catch (error) {
      console.error("Booking lookup error:", error);

      res.status(500).json({
        message: "Unable to load booking",
      });
    }
  }
);

export default router;
