import { Router } from "express";
import { z } from "zod";

import type { Server } from "socket.io";


import { db } from "../config/db.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middleware/auth.js";
import { randomUUID } from "node:crypto";
import {
  matchCarriers,
  type CarrierService,
} from "../services/carrier-matching.service.js";
import { calculatePrice } from "../services/pricing.service.js";
import { calculateUrgency } from "../services/urgency.service.js";
import {
  evaluateShipmentETA,
  ShipmentETAError,
} from "../services/shipment-eta.service.js";

const router = Router();

router.use(requireAuth);

const assignmentSchema = z.object({
  dispatcherEmail: z.email().trim().toLowerCase(),
}).strict();


// SHIPPER: ASSIGN A DISPATCHER TO AN OWNED BOOKED SHIPMENT
router.post(
  "/:shipmentId/dispatchers",
  requireRole("shipper"),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);
    const parsed = assignmentSchema.safeParse(req.body);

    if (!id.success || !parsed.success) {
      res.status(400).json({
        message: "Enter a valid shipment ID and dispatcher email",
      });
      return;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const shipmentResult = await client.query(
        `
          SELECT id, status
          FROM public.shipments
          WHERE id = $1 AND created_by = $2
          FOR UPDATE
        `,
        [id.data, req.authUser!.id]
      );

      const shipment = shipmentResult.rows[0];

      if (!shipment) {
        await client.query("ROLLBACK");

        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      const deliveredResult = await client.query(
        `
          SELECT 1
          FROM public.shipment_tracking_events
          WHERE shipment_id = $1
            AND milestone = 'delivered'
          LIMIT 1
        `,
        [id.data]
      );

      if (
        shipment.status !== "booked" ||
        deliveredResult.rows.length > 0
      ) {
        await client.query("ROLLBACK");

        res.status(409).json({
          message:
            "Dispatchers can only be assigned to active booked shipments",
        });
        return;
      }

      const dispatcherResult = await client.query(
        `
          SELECT id, full_name, email
          FROM public.users
          WHERE LOWER(email) = $1
            AND role = 'dispatcher'
            AND is_active = TRUE
          FOR SHARE
        `,
        [parsed.data.dispatcherEmail]
      );

      const dispatcher = dispatcherResult.rows[0];

      if (!dispatcher) {
        await client.query("ROLLBACK");

        res.status(404).json({
          message: "Active dispatcher account not found",
        });
        return;
      }

      await client.query(
        `
          INSERT INTO public.shipment_dispatchers (
            shipment_id,
            dispatcher_id,
            assigned_by
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (shipment_id, dispatcher_id)
          DO NOTHING
        `,
        [id.data, dispatcher.id, req.authUser!.id]
      );

      await client.query("COMMIT");

      res.json({
        message: "Dispatcher assigned",
        dispatcher: {
          id: dispatcher.id,
          fullName: dispatcher.full_name,
          email: dispatcher.email,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => { });

      console.error("Assign dispatcher:", error);

      res.status(500).json({
        message: "Unable to assign dispatcher",
      });
    } finally {
      client.release();
    }
  }
);


// DISPATCHER: LIST ONLY ASSIGNED SHIPMENTS
router.get(
  "/assigned-shipments",
  requireRole("dispatcher"),
  async (req: AuthRequest, res) => {
    res.setHeader("Cache-Control", "no-store");

    try {
      const result = await db.query(
        `
          SELECT
            s.id,
            s.tracking_code AS "trackingCode",
            s.origin_city AS "originCity",
            s.destination_city AS "destinationCity",
            s.cargo_type AS "cargoType",
            s.weight_kg::float8 AS "weightKg",
            s.deadline,
            s.status,
            state.risk_status AS "riskStatus",
            state.estimated_arrival AS "estimatedArrival",
            state.evaluated_at AS "evaluatedAt",
            assignment.assigned_at AS "assignedAt"
          FROM public.shipment_dispatchers assignment
          JOIN public.shipments s
            ON s.id = assignment.shipment_id
          LEFT JOIN public.shipment_sla_state state
            ON state.shipment_id = s.id
          WHERE assignment.dispatcher_id = $1
            AND s.status = 'booked'
            AND NOT EXISTS (
              SELECT 1
              FROM public.shipment_tracking_events event
              WHERE event.shipment_id = s.id
                AND event.milestone = 'delivered'
            )
          ORDER BY s.deadline ASC, s.id ASC
        `,
        [req.authUser!.id]
      );

      res.json({
        shipments: result.rows,
      });
    } catch (error) {
      console.error("List dispatcher shipments:", error);

      res.status(500).json({
        message: "Unable to load assigned shipments",
      });
    }
  }
);


// SHIPPER: VIEW DISPATCHERS ASSIGNED TO AN OWNED SHIPMENT
router.get(
  "/:shipmentId/dispatchers",
  requireRole("shipper"),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);

    if (!id.success) {
      res.status(400).json({
        message: "Invalid shipment ID",
      });
      return;
    }

    res.setHeader("Cache-Control", "no-store");

    try {
      const shipment = await db.query(
        `
          SELECT id
          FROM public.shipments
          WHERE id = $1 AND created_by = $2
        `,
        [id.data, req.authUser!.id]
      );

      if (!shipment.rows[0]) {
        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      const result = await db.query(
        `
          SELECT
            u.id,
            u.full_name AS "fullName",
            u.email,
            u.is_active AS "isActive",
            assignment.assigned_at AS "assignedAt"
          FROM public.shipment_dispatchers assignment
          JOIN public.users u
            ON u.id = assignment.dispatcher_id
          WHERE assignment.shipment_id = $1
          ORDER BY assignment.assigned_at DESC
        `,
        [id.data]
      );

      res.json({
        dispatchers: result.rows,
      });
    } catch (error) {
      console.error("List assigned dispatchers:", error);

      res.status(500).json({
        message: "Unable to load assigned dispatchers",
      });
    }
  }
);

router.post(
  "/:shipmentId/recommendations",
  requireRole("shipper", "dispatcher"),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);

    if (!id.success) {
      res.status(400).json({ message: "Invalid shipment ID" });
      return;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `
          SELECT
            s.*,
            b.id AS booking_id,
            b.carrier_lane_id AS current_lane_id,
            q.special_handling_inr,
            q.after_hours_inr
          FROM public.shipments s
          JOIN public.shipment_bookings b
            ON b.shipment_id = s.id
          JOIN public.pricing_quotes q ON q.id = b.quote_id
          WHERE s.id = $1
            AND (
              s.created_by = $2
              OR EXISTS (
                SELECT 1
                FROM public.shipment_dispatchers d
                WHERE d.shipment_id = s.id
                  AND d.dispatcher_id = $2
              )
            )
          FOR UPDATE OF s, b
        `,
        [id.data, req.authUser!.id]
      );

      const shipment = result.rows[0];

      if (!shipment) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "Shipment not found" });
        return;
      }

      // Current lanes support collection at the original city.
      // Transfers during transit need a separate transfer model.
      const movement = await client.query(
        `
          SELECT 1
          FROM public.shipment_tracking_events
          WHERE shipment_id = $1
            AND (
              event_type = 'location'
              OR milestone <> 'booked'
            )
          LIMIT 1
        `,
        [id.data]
      );

      if (
        shipment.status !== "booked" ||
        movement.rows.length > 0
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message:
            "These recovery options require a booked shipment before pickup or location simulation",
        });
        return;
      }

      const baseline = await evaluateShipmentETA(id.data);
      if (
        baseline.status !== "active" ||
        baseline.prediction === null
      ) {
        throw new ShipmentETAError(
          "Shipment no longer requires recovery.",
          409
        );
      }

      const lanes = await client.query(
        `
          SELECT
            l.id AS "laneId",
            c.id AS "carrierId",
            c.name AS "carrierName",
            c.contact_email AS "contactEmail",
            c.on_time_percentage::float8 AS "onTimePercentage",
            c.max_weight_kg::float8 AS "maxWeightKg",
            c.supported_cargo_types AS "supportedCargoTypes",
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
          JOIN public.carriers c ON c.id = l.carrier_id
          WHERE LOWER(TRIM(l.origin_city)) = LOWER(TRIM($1))
            AND LOWER(TRIM(l.destination_city)) = LOWER(TRIM($2))
            AND l.id <> $3
        `,
        [
          shipment.origin_city,
          shipment.destination_city,
          shipment.current_lane_id,
        ]
      );

      const now = new Date();
      const urgency = calculateUrgency({
        deadline: shipment.deadline,
        delayCostPerHour: Number(shipment.delay_cost_per_hour),
        cargoType: shipment.cargo_type,
      }, now);

      const matches = matchCarriers(
        {
          id: shipment.id,
          originCity: shipment.origin_city,
          destinationCity: shipment.destination_city,
          cargoType: shipment.cargo_type,
          weightKg: Number(shipment.weight_kg),
          deadline: shipment.deadline,
          urgencyScore: urgency.score,
        },
        lanes.rows as CarrierService[],
        now
      );

      const baselineArrival = new Date(
        baseline.prediction.estimated_arrival
      ).getTime();

      const expiresAt = new Date(now.getTime() + 5 * 60_000);
      const proposals = [];

      // New recommendations replace previous pending ones.
      await client.query(
        `
          UPDATE public.shipment_recovery_proposals
          SET status = 'superseded'
          WHERE shipment_id = $1 AND status = 'pending'
        `,
        [shipment.id]
      );

      for (const match of matches) {
        const savedMinutes =
          (baselineArrival -
            new Date(match.estimatedArrival).getTime()) / 60_000;

        if (savedMinutes < 1) continue;

        const price = calculatePrice({
          baseCarrierCostInr: match.estimatedCostInr,
          urgencyScore: urgency.score,
          specialHandling: Number(shipment.special_handling_inr) > 0,
          afterHours: Number(shipment.after_hours_inr) > 0,
        });

        const proposalId = randomUUID();

        const snapshot = {
          shipmentUpdatedAt: shipment.updated_at,
          deadline: shipment.deadline,
          originalLaneId: shipment.current_lane_id,
          carrierName: match.carrierName,
          transportMode: match.transportMode,
          reliability: match.reliability,
          price,
          specialHandling: Number(shipment.special_handling_inr) > 0,
          afterHours: Number(shipment.after_hours_inr) > 0,
          refundAssumption: "No refund of the original booking",
          recoveryScope: "before-pickup",
        };

        await client.query(
          `
            INSERT INTO public.shipment_recovery_proposals (
              id, shipment_id, booking_id,
              original_lane_id, proposed_lane_id, created_by,
              baseline_arrival, proposed_arrival,
              estimated_minutes, time_saved_minutes,
              proposed_service_cost_inr, additional_cost_inr,
              meets_deadline, assessment_snapshot,
              created_at, expires_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,
              $9,$10,$11,$12,$13,$14,$15,$16
            )
          `,
          [
            proposalId,
            shipment.id,
            shipment.booking_id,
            shipment.current_lane_id,
            match.laneId,
            req.authUser!.id,
            baseline.prediction.estimated_arrival,
            match.estimatedArrival,
            match.estimatedMinutes,
            Math.round(savedMinutes * 100) / 100,
            price.totalCostInr,
            price.totalCostInr,
            match.meetsDeadline,
            JSON.stringify(snapshot),
            now,
            expiresAt,
          ]
        );

        proposals.push({
          id: proposalId,
          carrierName: match.carrierName,
          transportMode: match.transportMode,
          estimatedArrival: match.estimatedArrival,
          timeSavedMinutes: Math.round(savedMinutes),
          additionalCostInr: price.totalCostInr,
          meetsDeadline: match.meetsDeadline,
          expiresAt: expiresAt.toISOString(),
        });
      }

      await client.query("COMMIT");

      res.json({
        proposals,
        message: proposals.length
          ? "Recovery options generated"
          : "No eligible alternative improves the current ETA",
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => { });

      if (error instanceof ShipmentETAError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      console.error("Generate recovery:", error);
      res.status(503).json({
        message: "Unable to generate recovery options",
      });
    } finally {
      client.release();
    }
  }
);

router.post(
  "/proposals/:proposalId/approve",
  requireRole("dispatcher"),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.proposalId);

    if (!id.success) {
      res.status(400).json({
        message: "Invalid proposal ID",
      });
      return;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const fail = (message: string, statusCode = 409): never => {
        throw new ShipmentETAError(message, statusCode);
      };

      // Find the shipment first, then use the same lock order
      // as recommendation generation: shipment, booking, proposal.
      const lookup = await client.query(
        `
          SELECT shipment_id
          FROM public.shipment_recovery_proposals
          WHERE id = $1
        `,
        [id.data]
      );

      if (!lookup.rows[0]) {
        fail("Proposal not found", 404);
      }

      const shipmentId = lookup.rows[0].shipment_id;

      const shipmentResult = await client.query(
        `
          SELECT
            s.*,
            b.id AS booking_id,
            b.carrier_lane_id AS current_lane_id
          FROM public.shipments s
          JOIN public.shipment_bookings b
            ON b.shipment_id = s.id
          WHERE s.id = $1
          FOR UPDATE OF s, b
        `,
        [shipmentId]
      );

      const shipment = shipmentResult.rows[0];

      if (!shipment) {
        fail("Shipment not found", 404);
      }

      const assignment = await client.query(
        `
          SELECT 1
          FROM public.shipment_dispatchers
          WHERE shipment_id = $1 AND dispatcher_id = $2
          FOR SHARE
        `,
        [shipmentId, req.authUser!.id]
      );

      if (!assignment.rows[0]) {
        fail("Proposal not found", 404);
      }

      const proposalResult = await client.query(
        `
          SELECT *
          FROM public.shipment_recovery_proposals
          WHERE id = $1
          FOR UPDATE
        `,
        [id.data]
      );

      const proposal = proposalResult.rows[0];

      if (!proposal || proposal.status !== "pending") {
        fail("Proposal is no longer pending");
      }

      if (new Date(proposal.expires_at).getTime() <= Date.now()) {
        fail("Proposal expired. Generate new recommendations.");
      }

      const snapshot = proposal.assessment_snapshot;

      if (
        shipment.status !== "booked" ||
        shipment.booking_id !== proposal.booking_id ||
        shipment.current_lane_id !== proposal.original_lane_id ||
        new Date(shipment.updated_at).getTime() !==
        new Date(snapshot.shipmentUpdatedAt).getTime()
      ) {
        fail("Shipment or booking changed. Generate new recommendations.");
      }

      const movement = await client.query(
        `
          SELECT 1
          FROM public.shipment_tracking_events
          WHERE shipment_id = $1
            AND (
              event_type = 'location'
              OR milestone <> 'booked'
            )
          LIMIT 1
        `,
        [shipmentId]
      );

      if (movement.rows[0]) {
        fail("Shipment has moved. Before-pickup recovery cannot be approved.");
      }

      const laneResult = await client.query(
        `
          SELECT
            l.*,
            c.is_active,
            c.max_weight_kg,
            c.supported_cargo_types,
            c.name AS carrier_name
          FROM public.carrier_service_lanes l
          JOIN public.carriers c ON c.id = l.carrier_id
          WHERE l.id = $1
          FOR SHARE OF l, c
        `,
        [proposal.proposed_lane_id]
      );

      const lane = laneResult.rows[0];

      if (
        !lane ||
        !lane.is_active ||
        !lane.is_available ||
        Number(shipment.weight_kg) > Number(lane.max_weight_kg) ||
        !lane.supported_cargo_types.includes(shipment.cargo_type) ||
        lane.origin_city.trim().toLowerCase() !==
        shipment.origin_city.trim().toLowerCase() ||
        lane.destination_city.trim().toLowerCase() !==
        shipment.destination_city.trim().toLowerCase()
      ) {
        fail("Alternative carrier is no longer eligible.");
      }

      const minutes =
        Number(lane.pickup_minutes) +
        Number(lane.transit_minutes);

      if (minutes !== Number(proposal.estimated_minutes)) {
        fail("Carrier transit time changed. Generate new recommendations.");
      }

      const now = new Date();

      const urgency = calculateUrgency({
        deadline: shipment.deadline,
        delayCostPerHour: Number(shipment.delay_cost_per_hour),
        cargoType: shipment.cargo_type,
      }, now);

      const price = calculatePrice({
        baseCarrierCostInr:
          Number(lane.base_cost_inr) +
          Number(lane.cost_per_kg_inr) * Number(shipment.weight_kg),
        urgencyScore: urgency.score,
        specialHandling: snapshot.specialHandling === true,
        afterHours: snapshot.afterHours === true,
      });

      if (
        Math.round(price.totalCostInr * 100) !==
        Math.round(Number(proposal.additional_cost_inr) * 100)
      ) {
        fail("Recovery price changed. Generate new recommendations.");
      }

      const baseline = await evaluateShipmentETA(shipmentId);

      if (baseline.status !== "active") {
        fail("Shipment no longer requires recovery.");
      }

      // Use approval time, not the old proposal creation time.
      const approvedAt = new Date();
      const arrival = new Date(
        approvedAt.getTime() + minutes * 60_000
      );

      const prediction = baseline.prediction;

      if (prediction === null) {
        throw new ShipmentETAError(
          "Shipment no longer requires recovery.",
          409
        );
      }

      const savedMinutes =
        (
          new Date(prediction.estimated_arrival).getTime() -
          arrival.getTime()
        ) / 60_000;
      const meetsDeadline =
        arrival.getTime() <= new Date(shipment.deadline).getTime();

      if (
        savedMinutes < 1 ||
        (proposal.meets_deadline && !meetsDeadline)
      ) {
        fail("The proposed recovery no longer offers the quoted benefit.");
      }

      if (
        new Date(proposal.expires_at).getTime() <=
        approvedAt.getTime()
      ) {
        fail("Proposal expired. Generate new recommendations.");
      }

      await client.query(
        `
          UPDATE public.shipment_bookings
          SET
            carrier_lane_id = $1,
            estimated_arrival = $2,
            total_cost_inr = total_cost_inr + $3::numeric
          WHERE id = $4
        `,
        [
          lane.id,
          arrival,
          proposal.additional_cost_inr,
          shipment.booking_id,
        ]
      );

      await client.query(
        `
          INSERT INTO public.shipment_recovery_actions (
            id,
            proposal_id,
            shipment_id,
            approved_by,
            previous_lane_id,
            replacement_lane_id,
            additional_cost_inr,
            approved_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          randomUUID(),
          proposal.id,
          shipmentId,
          req.authUser!.id,
          shipment.current_lane_id,
          lane.id,
          proposal.additional_cost_inr,
          approvedAt,
        ]
      );

      await client.query(
        `
          UPDATE public.shipment_recovery_proposals
          SET status = 'approved',
              reviewed_by = $1,
              reviewed_at = $2
          WHERE id = $3
        `,
        [req.authUser!.id, approvedAt, proposal.id]
      );

      await client.query(
        `
          UPDATE public.shipment_recovery_proposals
          SET status = 'superseded'
          WHERE shipment_id = $1
            AND status = 'pending'
        `,
        [shipmentId]
      );

      await client.query(
        `
          UPDATE public.shipments
          SET updated_at = clock_timestamp()
          WHERE id = $1
        `,
        [shipmentId]
      );


      await client.query("COMMIT");

      // Notify the shipment owner's tracking view after
      // the new carrier and booking changes are committed.
      const io = req.app.get("trackingIo") as Server | undefined;

      io?.to(`shipment:${shipmentId}`).emit("tracking:updated", {
        shipmentId,
      });

      res.json({
        message: "Recovery approved",

        carrierName: lane.carrier_name,
        estimatedArrival: arrival.toISOString(),
        additionalCostInr: Number(proposal.additional_cost_inr),
        timeSavedMinutes: Math.round(savedMinutes),
        meetsDeadline,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => { });

      if (error instanceof ShipmentETAError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      console.error("Approve recovery:", error);

      res.status(500).json({
        message: "Unable to approve recovery",
      });
    } finally {
      client.release();
    }
  }
);


export default router;