
import { Router } from "express";
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
  type CarrierService,
} from "../services/carrier-matching.service.js";

const router = Router();

router.use(requireAuth);

// GET THE CARRIER CATALOG
router.get("/", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        on_time_percentage::float8
          AS "onTimePercentage",
        max_weight_kg::float8 AS "maxWeightKg",
        supported_cargo_types AS "supportedCargoTypes",
        is_active AS "isActive"
      FROM public.carriers
      ORDER BY name
    `);

    res.json({ carriers: result.rows });
  } catch (error) {
    console.error("Carrier catalog error:", error);

    res.status(500).json({
      message: "Unable to load carrier catalog",
    });
  }
});

// MATCH CARRIERS TO AN OWNED SHIPMENT
router.get(
  "/match/:shipmentId",
  requireRole("shipper"),
  async (req: AuthRequest, res) => {
    const parsed = z.uuid().safeParse(
      req.params.shipmentId
    );

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid shipment ID",
      });
      return;
    }

    try {
      const shipmentResult = await db.query(
        `
          SELECT
            id,
            origin_city AS "originCity",
            destination_city AS "destinationCity",
            cargo_type AS "cargoType",
            weight_kg::float8 AS "weightKg",
            deadline,
            delay_cost_per_hour::float8
              AS "delayCostPerHour",
            status
          FROM public.shipments
          WHERE id = $1
            AND created_by = $2
        `,
        [
          parsed.data,
          req.authUser!.id,
        ]
      );

      const shipment = shipmentResult.rows[0];

      if (!shipment) {
        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      if (shipment.status === "cancelled") {
        res.status(409).json({
          message:
            "Cancelled shipments cannot be matched",
        });
        return;
      }

      // Use a fresh urgency score rather than
      // trusting an older stored snapshot.
      const urgency = calculateUrgency({
        deadline: shipment.deadline,
        delayCostPerHour:
          shipment.delayCostPerHour,
        cargoType: shipment.cargoType,
      });

      const carrierResult = await db.query(`
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
        WHERE LOWER(TRIM(l.origin_city))
          = LOWER(TRIM($1))
          AND LOWER(TRIM(l.destination_city))
          = LOWER(TRIM($2))
      `, [
        shipment.originCity,
        shipment.destinationCity,
      ]);

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
        carrierResult.rows as CarrierService[]
      );

      res.setHeader("Cache-Control", "no-store");

      res.json({
        shipmentId: shipment.id,
        urgencyScore: urgency.score,
        urgencyLevel: urgency.level,
        calculatedAt: new Date().toISOString(),
        estimatedOnly: true,
        matches,
      });
    } catch (error) {
      console.error("Carrier matching error:", error);

      res.status(500).json({
        message:
          "Unable to calculate carrier recommendations",
      });
    }
  }
);

// DISPATCHER-ONLY SERVICE AVAILABILITY MANAGEMENT
router.patch(
  "/lanes/:laneId/availability",
  requireRole("dispatcher"),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.laneId);
    const input = z.object({
      available: z.boolean(),
    }).safeParse(req.body);

    if (!id.success || !input.success) {
      res.status(400).json({
        message: "Invalid availability update",
      });
      return;
    }

    try {
      const result = await db.query(
        `
          UPDATE public.carrier_service_lanes
          SET is_available = $1
          WHERE id = $2
          RETURNING id, is_available
        `,
        [input.data.available, id.data]
      );

      if (!result.rows[0]) {
        res.status(404).json({
          message: "Carrier service lane not found",
        });
        return;
      }

      res.json({
        message: "Availability updated",
        lane: result.rows[0],
      });
    } catch (error) {
      console.error("Availability update error:", error);

      res.status(500).json({
        message: "Unable to update availability",
      });
    }
  }
);

export default router;
