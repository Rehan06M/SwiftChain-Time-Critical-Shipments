import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Server } from "socket.io";
import { z } from "zod";

import { db } from "../config/db.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middleware/auth.js";
import {
  evaluateShipmentETA,
  ShipmentETAError,
} from "../services/shipment-eta.service.js";
import { calculateUrgency } from "../services/urgency.service.js";
import { calculatePrice } from "../services/pricing.service.js";
import { distanceKm } from "../services/eta.service.js";
import {
  recoveryPlanSchema,
  type RecoveryPlan,
  type RoutePoint,
} from "../services/recovery-route.js";

const router = Router();
router.use(requireAuth, requireRole("dispatcher"));

function fail(message: string, statusCode = 409): never {
  throw new ShipmentETAError(message, statusCode);
}

async function context(
  client: PoolClient,
  shipmentId: string,
  dispatcherId: string
) {
  const result = await client.query(
    `
      SELECT
        s.*,
        b.id AS booking_id,
        b.carrier_lane_id AS current_lane_id,
        q.special_handling_inr,
        q.after_hours_inr
      FROM public.shipments s
      JOIN public.shipment_bookings b ON b.shipment_id = s.id
      JOIN public.pricing_quotes q ON q.id = b.quote_id
      WHERE s.id = $1
        AND EXISTS (
          SELECT 1 FROM public.shipment_dispatchers d
          WHERE d.shipment_id = s.id
            AND d.dispatcher_id = $2
        )
      FOR UPDATE OF s, b
    `,
    [shipmentId, dispatcherId]
  );

  const shipment = result.rows[0];

  if (!shipment) fail("Assigned shipment not found", 404);
  if (shipment.status !== "booked") fail("Shipment must be booked");

  const milestone = await client.query(
    `
      SELECT milestone
      FROM public.shipment_tracking_events
      WHERE shipment_id = $1 AND event_type = 'milestone'
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1
    `,
    [shipmentId]
  );

  if (!["picked_up", "in_transit"].includes(
    milestone.rows[0]?.milestone
  )) {
    fail("Transit recovery requires Picked Up or In Transit status");
  }

  const location = await client.query(
    `
      SELECT
        id,
        latitude::float8 AS latitude,
        longitude::float8 AS longitude,
        occurred_at
      FROM public.shipment_tracking_events
      WHERE shipment_id = $1
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1
    `,
    [shipmentId]
  );

  const position = location.rows[0];

  if (
    !position ||
    Date.now() - new Date(position.occurred_at).getTime() > 120_000
  ) {
    fail("Send a fresh location update before generating or approving");
  }

  return { shipment, position };
}

async function buildOptions(
  client: PoolClient,
  current: Awaited<ReturnType<typeof context>>
) {
  const { shipment, position } = current;

  const baseline = await evaluateShipmentETA(shipment.id);
  const prediction = baseline.prediction;

  if (baseline.status !== "active" || prediction === null) {
    throw new ShipmentETAError("Shipment is no longer active", 409);
  }

  const result = await client.query(
    `
      SELECT
        l.*,
        c.name AS carrier_name,
        h.name AS hub_name,
        h.latitude::float8 AS hub_latitude,
        h.longitude::float8 AS hub_longitude
      FROM public.carrier_service_lanes l
      JOIN public.carriers c ON c.id = l.carrier_id
      JOIN public.transfer_points h ON h.id = l.transfer_point_id
      WHERE c.is_active = TRUE
        AND l.is_available = TRUE
        AND h.is_active = TRUE
        AND LOWER(TRIM(l.destination_city)) = LOWER(TRIM($1))
        AND c.max_weight_kg >= $2
        AND $3::text = ANY(c.supported_cargo_types)
        AND l.id <> $4
      ORDER BY l.id
      FOR SHARE OF l, c, h
    `,
    [
      shipment.destination_city,
      shipment.weight_kg,
      shipment.cargo_type,
      shipment.current_lane_id,
    ]
  );

  const now = new Date();
  const urgency = calculateUrgency({
    deadline: shipment.deadline,
    delayCostPerHour: Number(shipment.delay_cost_per_hour),
    cargoType: shipment.cargo_type,
  }, now);

  const baselineMinutes = Math.max(
    0,
    (new Date(prediction.estimated_arrival).getTime() -
      now.getTime()) / 60_000
  );

  const pointListSchema = z.array(
    z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ])
  ).min(2).max(18);

  const options = [];

  for (const lane of result.rows) {
    const parsed = pointListSchema.safeParse(lane.route_points);
    if (!parsed.success) continue;

    const points = parsed.data;
    const first = points[0]!;
    const last = points[points.length - 1]!;

    // Configured path must start at its hub and end at this destination.
    if (
      distanceKm(
        first[1], first[0],
        lane.hub_latitude, lane.hub_longitude
      ) > 0.5 ||
      distanceKm(
        last[1], last[0],
        Number(shipment.destination_latitude),
        Number(shipment.destination_longitude)
      ) > 1
    ) continue;

    const approachKm = distanceKm(
      position.latitude,
      position.longitude,
      lane.hub_latitude,
      lane.hub_longitude
    );

    if (approachKm > Number(lane.max_approach_km)) continue;

    const approachMinutes =
      approachKm / Number(lane.approach_speed_kmh) * 60;

    const lengths = points.slice(1).map((point, index) =>
      distanceKm(
        points[index]![1], points[index]![0],
        point[1], point[0]
      )
    );

    const length = lengths.reduce((a, b) => a + b, 0);
    if (length < 0.01) continue;

    const transitMinutes = Number(lane.transit_minutes);
    if (
      transitMinutes <= 0 ||
      length / (transitMinutes / 60) > 1000
    ) continue;

    const handoffMinutes =
      Number(lane.handoff_minutes) +
      Number(lane.pickup_minutes);

    const estimatedMinutes =
      approachMinutes + handoffMinutes + transitMinutes;

    const timeSavedMinutes = baselineMinutes - estimatedMinutes;
    if (timeSavedMinutes < 1) continue;

    const price = calculatePrice({
      baseCarrierCostInr:
        Number(lane.base_cost_inr) +
        Number(lane.cost_per_kg_inr) * Number(shipment.weight_kg),
      urgencyScore: urgency.score,
      specialHandling: Number(shipment.special_handling_inr) > 0,
      afterHours: Number(shipment.after_hours_inr) > 0,
    });

    const handoffCostInr = Number(lane.handoff_cost_inr);
    const additionalCostInr = Math.round(
      (price.totalCostInr + handoffCostInr) * 100
    ) / 100;

    const start: RoutePoint = [
      position.longitude,
      position.latitude,
    ];

    const plan: RecoveryPlan = {
      label: lane.route_name || lane.hub_name,
      points: [start, ...points],
      travelMinutes: [
        approachMinutes,
        ...lengths.map(
          (segment) => transitMinutes * segment / length
        ),
      ],
      handoffMinutes,
    };

    recoveryPlanSchema.parse(plan);

    const arrival = new Date(
      now.getTime() + estimatedMinutes * 60_000
    );

    options.push({
      laneId: lane.id as string,
      carrierName: lane.carrier_name as string,
      transportMode: lane.transport_mode as string,
      transferPoint: lane.hub_name as string,
      routeName: plan.label,
      approachMinutes,
      handoffMinutes,
      handoffCostInr,
      serviceCostInr: price.totalCostInr,
      additionalCostInr,
      estimatedMinutes,
      estimatedArrival: arrival.toISOString(),
      baselineArrival: prediction.estimated_arrival,
      timeSavedMinutes,
      meetsDeadline:
        arrival.getTime() <= new Date(shipment.deadline).getTime(),
      plan,
    });
  }

  return options.sort(
    (a, b) =>
      Number(b.meetsDeadline) - Number(a.meetsDeadline) ||
      a.estimatedMinutes - b.estimatedMinutes ||
      a.additionalCostInr - b.additionalCostInr
  );
}

router.post(
  "/:shipmentId/recommendations",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);

    if (!id.success) {
      res.status(400).json({ message: "Invalid shipment ID" });
      return;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const current = await context(
        client, id.data, req.authUser!.id
      );

      const options = await buildOptions(client, current);

      await client.query(
        `
          UPDATE public.shipment_recovery_proposals
          SET status = 'superseded'
          WHERE shipment_id = $1 AND status = 'pending'
        `,
        [id.data]
      );

      const expiresAt = new Date(Date.now() + 5 * 60_000);
      const proposals = [];

      for (const option of options) {
        const proposalId = randomUUID();

        const snapshot = {
          scope: "transit-v1",
          locationEventId: current.position.id,
          shipmentUpdatedAt: current.shipment.updated_at,
          option,
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
              $9,$10,$11,$12,$13,$14,clock_timestamp(),$15
            )
          `,
          [
            proposalId,
            id.data,
            current.shipment.booking_id,
            current.shipment.current_lane_id,
            option.laneId,
            req.authUser!.id,
            option.baselineArrival,
            option.estimatedArrival,
            option.estimatedMinutes,
            option.timeSavedMinutes,
            option.serviceCostInr,
            option.additionalCostInr,
            option.meetsDeadline,
            JSON.stringify(snapshot),
            expiresAt,
          ]
        );

        proposals.push({
          ...option,
          id: proposalId,
          expiresAt: expiresAt.toISOString(),
        });
      }

      await client.query("COMMIT");

      res.json({
        proposals,
        message: proposals.length
          ? "Transfer recovery options generated"
          : "No reachable transfer service improves the current ETA",
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Transit recommendations:", error);

      res.status(
        error instanceof ShipmentETAError ? error.statusCode : 503
      ).json({
        message: error instanceof ShipmentETAError
          ? error.message
          : "Unable to generate transit recovery",
      });
    } finally {
      client.release();
    }
  }
);

router.post(
  "/proposals/:proposalId/approve",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.proposalId);

    if (!id.success) {
      res.status(400).json({ message: "Invalid proposal ID" });
      return;
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const lookup = await client.query(
        `
          SELECT shipment_id
          FROM public.shipment_recovery_proposals
          WHERE id = $1
        `,
        [id.data]
      );

      if (!lookup.rows[0]) fail("Proposal not found", 404);

      const shipmentId = lookup.rows[0].shipment_id;

      const current = await context(
        client, shipmentId, req.authUser!.id
      );

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

      const snapshot = proposal.assessment_snapshot;

      if (
        snapshot.scope !== "transit-v1" ||
        proposal.booking_id !== current.shipment.booking_id ||
        proposal.original_lane_id !== current.shipment.current_lane_id ||
        snapshot.locationEventId !== current.position.id ||
        new Date(snapshot.shipmentUpdatedAt).getTime() !==
          new Date(current.shipment.updated_at).getTime()
      ) {
        fail("Shipment moved or changed. Generate new options.");
      }

      if (new Date(proposal.expires_at).getTime() <= Date.now()) {
        fail("Proposal expired. Generate new options.");
      }

      const options = await buildOptions(client, current);
      const chosen = options.find(
        (option) => option.laneId === proposal.proposed_lane_id
      );

      if (
        !chosen ||
        Math.round(chosen.additionalCostInr * 100) !==
          Math.round(Number(proposal.additional_cost_inr) * 100) ||
        JSON.stringify(chosen.plan) !==
          JSON.stringify(snapshot.option.plan) ||
        (proposal.meets_deadline && !chosen.meetsDeadline)
      ) {
        fail("Service, price or benefit changed. Generate new options.");
      }

      if (new Date(proposal.expires_at).getTime() <= Date.now()) {
        fail("Proposal expired. Generate new options.");
      }

      await client.query(
        `
          UPDATE public.shipment_bookings
          SET carrier_lane_id = $1,
              estimated_arrival = $2,
              total_cost_inr = total_cost_inr + $3::numeric
          WHERE id = $4
        `,
        [
          chosen.laneId,
          chosen.estimatedArrival,
          chosen.additionalCostInr,
          current.shipment.booking_id,
        ]
      );

      await client.query(
        `
          INSERT INTO public.shipment_recovery_actions (
            id, proposal_id, shipment_id, approved_by,
            previous_lane_id, replacement_lane_id,
            additional_cost_inr
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          randomUUID(),
          proposal.id,
          shipmentId,
          req.authUser!.id,
          current.shipment.current_lane_id,
          chosen.laneId,
          chosen.additionalCostInr,
        ]
      );

      await client.query(
        `
          UPDATE public.shipments
          SET recovery_route = $1::jsonb,
              route_revision = route_revision + 1,
              updated_at = clock_timestamp()
          WHERE id = $2
        `,
        [JSON.stringify(chosen.plan), shipmentId]
      );

      await client.query(
        `
          UPDATE public.shipment_recovery_proposals
          SET status = 'approved',
              reviewed_by = $1,
              reviewed_at = clock_timestamp()
          WHERE id = $2
        `,
        [req.authUser!.id, proposal.id]
      );

      await client.query(
        `
          UPDATE public.shipment_recovery_proposals
          SET status = 'superseded'
          WHERE shipment_id = $1 AND status = 'pending'
        `,
        [shipmentId]
      );

      await client.query("COMMIT");

      const io = req.app.get("trackingIo") as Server | undefined;
      io?.to(`shipment:${shipmentId}`).emit("tracking:updated", {
        shipmentId,
      });

      res.json({
        message: "Transit recovery approved",
        estimatedArrival: chosen.estimatedArrival,
        routeName: chosen.routeName,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Approve transit recovery:", error);

      res.status(
        error instanceof ShipmentETAError ? error.statusCode : 500
      ).json({
        message: error instanceof ShipmentETAError
          ? error.message
          : "Unable to approve transit recovery",
      });
    } finally {
      client.release();
    }
  }
);

export default router;