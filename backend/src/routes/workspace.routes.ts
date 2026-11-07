import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Server } from "socket.io";

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
import { predictETA } from "../services/eta.service.js";


import { rateLimit } from "express-rate-limit";

import {
  generateGroqCopilotReply,
  GroqCopilotError,
} from "../services/groq-copilot.service.js";
const router = Router();

router.use(requireAuth);

// Parameters:
// $1 = user ID
// $2 = authenticated role
const visibility = `
  (
    ($2::text = 'shipper' AND s.created_by = $1::uuid)

    OR

    ($2::text = 'dispatcher' AND EXISTS (
      SELECT 1
      FROM public.shipment_dispatchers assignment
      WHERE assignment.shipment_id = s.id
        AND assignment.dispatcher_id = $1::uuid
    ))

    OR

    ($2::text = 'carrier' AND EXISTS (
      SELECT 1
      FROM public.carrier_accounts account
      WHERE account.user_id = $1::uuid
        AND account.carrier_id = lane.carrier_id
    ))
  )
`;

router.get("/", async (req: AuthRequest, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const result = await db.query(
      `
        SELECT
          s.id,
          s.tracking_code AS "trackingCode",
          s.origin_city AS "originCity",
          s.destination_city AS "destinationCity",
          s.cargo_description AS "cargoDescription",
          s.cargo_type AS "cargoType",
          s.weight_kg::float8 AS "weightKg",
          s.deadline,
          s.status,
          s.urgency_score AS "urgencyScore",
          s.route_revision AS "routeRevision",
          s.recovery_route AS "recoveryRoute",

          s.origin_latitude::float8 AS "originLatitude",
          s.origin_longitude::float8 AS "originLongitude",
          s.destination_latitude::float8 AS "destinationLatitude",
          s.destination_longitude::float8 AS "destinationLongitude",

          carrier.name AS "carrierName",
          carrier.on_time_percentage::float8 AS "onTimePercentage",
          lane.transport_mode AS "transportMode",
          s.delay_cost_per_hour::float8 AS "delayCostPerHour",

(
  state.evaluated_at IS NULL
  OR state.evaluated_at < NOW() - INTERVAL '2 minutes'
) AS "slaAssessmentStale",

CASE
  WHEN s.status = 'booked'
    AND COALESCE(milestone.milestone, 'booked') <> 'delivered'
    AND state.evaluated_at >= NOW() - INTERVAL '2 minutes'
  THEN ROUND(
    (
      GREATEST(
        0,
        EXTRACT(
          EPOCH FROM (state.estimated_arrival - s.deadline)
        ) / 3600
      ) * s.delay_cost_per_hour
    )::numeric,
    2
  )::float8
  ELSE NULL
END AS "predictedDelayCostInr",

          state.risk_status AS "riskStatus",
          state.evaluated_at AS "evaluatedAt",

          COALESCE(milestone.milestone, s.status)
            AS "trackingStatus",

          location.latitude::float8 AS "currentLatitude",
          location.longitude::float8 AS "currentLongitude",
          location.occurred_at AS "locationRecordedAt",

          COALESCE(
            (
              SELECT jsonb_agg(
                event_row
                ORDER BY event_row."occurredAt" DESC, event_row.id DESC
              )
              FROM (
                SELECT
                  e.id,
                  e.event_type AS "eventType",
                  e.milestone,
                  e.message,
                  e.source,
                  e.occurred_at AS "occurredAt"
                FROM public.shipment_tracking_events e
                WHERE e.shipment_id = s.id
                ORDER BY e.occurred_at DESC, e.id DESC
                LIMIT 20
              ) event_row
            ),
            '[]'::jsonb
          ) AS events

        FROM public.shipments s

        LEFT JOIN public.shipment_bookings booking
          ON booking.shipment_id = s.id

        LEFT JOIN public.carrier_service_lanes lane
          ON lane.id = booking.carrier_lane_id

        LEFT JOIN public.carriers carrier
          ON carrier.id = lane.carrier_id

        LEFT JOIN public.shipment_sla_state state
          ON state.shipment_id = s.id

        LEFT JOIN LATERAL (
          SELECT e.milestone
          FROM public.shipment_tracking_events e
          WHERE e.shipment_id = s.id
            AND e.event_type = 'milestone'
          ORDER BY e.occurred_at DESC, e.id DESC
          LIMIT 1
        ) milestone ON TRUE

        LEFT JOIN LATERAL (
          SELECT e.latitude, e.longitude, e.occurred_at
          FROM public.shipment_tracking_events e
          WHERE e.shipment_id = s.id
            AND e.latitude IS NOT NULL
            AND e.longitude IS NOT NULL
          ORDER BY e.occurred_at DESC, e.id DESC
          LIMIT 1
        ) location ON TRUE

        WHERE ${visibility}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 200
      `,
      [req.authUser!.id, req.authUser!.role]
    );

    res.json({
      shipments: result.rows,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Workspace shipments:", error);

    res.status(500).json({
      message: "Unable to load workspace",
    });
  }
});

router.get(
  "/:shipmentId/eta",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);

    if (!id.success) {
      res.status(400).json({ message: "Invalid shipment ID" });
      return;
    }

    res.setHeader("Cache-Control", "no-store");

    try {
      const access = await db.query(
        `
          SELECT s.id
          FROM public.shipments s
          LEFT JOIN public.shipment_bookings booking
            ON booking.shipment_id = s.id
          LEFT JOIN public.carrier_service_lanes lane
            ON lane.id = booking.carrier_lane_id
          WHERE ${visibility}
            AND s.id = $3::uuid
        `,
        [req.authUser!.id, req.authUser!.role, id.data]
      );

      if (!access.rows[0]) {
        res.status(404).json({ message: "Shipment not found" });
        return;
      }

      // Access was checked above for the authenticated role.
      const assessment = await evaluateShipmentETA(id.data);
      res.json(assessment);
    } catch (error) {
      if (error instanceof ShipmentETAError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      console.error("Workspace ETA:", error);

      res.status(503).json({
        message: "ETA service temporarily unavailable",
      });
    }
  }
);

const milestoneSequence = [
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

const carrierUpdateSchema = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal("location"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    routeRevision: z.number().int().nonnegative(),
    message: z.string().trim().max(500).optional(),
  }).strict(),

  z.object({
    eventType: z.literal("milestone"),
    milestone: z.enum([
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
    ]),
    routeRevision: z.number().int().nonnegative(),
    message: z.string().trim().max(500).optional(),
  }).strict(),
]);

router.post(
  "/:shipmentId/carrier-update",
  requireRole("carrier"),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);
    const parsed = carrierUpdateSchema.safeParse(req.body);

    if (!id.success || !parsed.success) {
      res.status(400).json({
        message: "Invalid shipment update",
      });
      return;
    }

    let client;

    try {
      client = await db.connect();
      await client.query("BEGIN");

      // Same shipment/booking lock order as recovery approval.
      const result = await client.query(
        `
          SELECT
            s.id,
            s.status,
            s.route_revision,
            lane.carrier_id
          FROM public.shipments s
          JOIN public.shipment_bookings booking
            ON booking.shipment_id = s.id
          JOIN public.carrier_service_lanes lane
            ON lane.id = booking.carrier_lane_id
          WHERE s.id = $1
          FOR UPDATE OF s, booking
        `,
        [id.data]
      );

      const shipment = result.rows[0];

      const access = shipment
        ? await client.query(
          `
              SELECT 1
              FROM public.carrier_accounts
              WHERE user_id = $1 AND carrier_id = $2
              FOR SHARE
            `,
          [req.authUser!.id, shipment.carrier_id]
        )
        : null;

      if (!shipment || !access?.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "Shipment not found" });
        return;
      }

      if (
        shipment.status !== "booked" ||
        shipment.route_revision !== parsed.data.routeRevision
      ) {
        await client.query("ROLLBACK");

        res.status(409).json({
          message: "Shipment or route changed. Refresh the dashboard.",
        });
        return;
      }

      const latest = await client.query(
        `
          SELECT milestone
          FROM public.shipment_tracking_events
          WHERE shipment_id = $1 AND event_type = 'milestone'
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1
        `,
        [id.data]
      );

      const current = latest.rows[0]?.milestone ?? "booked";

      if (current === "delivered") {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "Shipment has already been delivered",
        });
        return;
      }

      const input = parsed.data;

      if (input.eventType === "milestone") {
        const index = milestoneSequence.findIndex(
          (value) => value === current
        );

        if (
          index < 0 ||
          milestoneSequence[index + 1] !== input.milestone
        ) {
          await client.query("ROLLBACK");
          res.status(409).json({
            message: "Milestones must be recorded in order",
          });
          return;
        }
      }

      await client.query(
        `
          INSERT INTO public.shipment_tracking_events (
            id, shipment_id, event_type, milestone,
            latitude, longitude, message, source,
            created_by, occurred_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,'driver',$8,clock_timestamp()
          )
        `,
        [
          randomUUID(),
          id.data,
          input.eventType,
          input.eventType === "milestone" ? input.milestone : null,
          input.eventType === "location" ? input.latitude : null,
          input.eventType === "location" ? input.longitude : null,
          input.message || null,
          req.authUser!.id,
        ]
      );

      await client.query("COMMIT");

      const io = req.app.get("trackingIo") as Server | undefined;

      io?.to(`shipment:${id.data}`).emit("tracking:updated", {
        shipmentId: id.data,
      });

      res.status(201).json({
        message: "Carrier update saved",
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => { });
      }

      console.error("Carrier update:", error);

      res.status(500).json({
        message: "Unable to save carrier update",
      });
    } finally {
      client?.release();
    }
  }
);

const whatIfSchema = z.object({
  speedFactor: z.number().finite().min(0.25).max(2),
  extraDelayMinutes: z.number().finite().min(0).max(1440),
  deadlineShiftMinutes: z.number().finite().min(-1440).max(10080),
  additionalCostInr: z.number().finite().min(0).max(10_000_000),
}).strict();

router.post(
  "/:shipmentId/what-if",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);
    const parsed = whatIfSchema.safeParse(req.body);

    if (!id.success || !parsed.success) {
      res.status(400).json({
        message: "Enter valid simulation values",
      });
      return;
    }

    res.setHeader("Cache-Control", "no-store");

    try {
      const access = await db.query(
        `
          SELECT
            s.id,
            s.deadline,
            s.delay_cost_per_hour::float8 AS delay_cost_per_hour
          FROM public.shipments s
          LEFT JOIN public.shipment_bookings booking
            ON booking.shipment_id = s.id
          LEFT JOIN public.carrier_service_lanes lane
            ON lane.id = booking.carrier_lane_id
          WHERE ${visibility}
            AND s.id = $3::uuid
        `,
        [req.authUser!.id, req.authUser!.role, id.data]
      );

      const shipment = access.rows[0];

      if (!shipment) {
        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      const assessment = await evaluateShipmentETA(id.data);
      const baseline = assessment.prediction;

      if (assessment.status !== "active" || baseline === null) {
        res.status(409).json({
          message: "Simulation requires an active booked shipment",
        });
        return;
      }

      const options = parsed.data;
      const breakdown = baseline.breakdown;

      const originalDeadline = new Date(shipment.deadline);
      const scenarioDeadline = new Date(
        originalDeadline.getTime() +
        options.deadlineShiftMinutes * 60_000
      );

      const distance = assessment.remainingDistanceKm;

      const baseSpeed =
        distance > 0 &&
          breakdown.travel_minutes > 0
          ? distance / (breakdown.travel_minutes / 60)
          : 60;

      const scenarioSpeed = baseSpeed * options.speedFactor;

      if (scenarioSpeed <= 0 || scenarioSpeed > 1000) {
        res.status(400).json({
          message:
            "This speed adjustment exceeds the supported simulation range",
        });
        return;
      }

      const scenario = await predictETA({
        shipment_id: shipment.id,
        deadline: scenarioDeadline.toISOString(),
        remaining_distance_km: distance,
        average_speed_kmh: scenarioSpeed,
        pickup_minutes: breakdown.pickup_minutes,
        handling_minutes: breakdown.handling_minutes,
        disruption_minutes:
          breakdown.disruption_minutes +
          options.extraDelayMinutes,
      });

      const costPerHour = Number(shipment.delay_cost_per_hour);

      const exposure = (
        arrival: string,
        deadline: Date
      ) => {
        const lateHours = Math.max(
          0,
          (
            new Date(arrival).getTime() -
            deadline.getTime()
          ) / 3_600_000
        );

        return Math.round(lateHours * costPerHour * 100) / 100;
      };

      const baselineExposure = exposure(
        baseline.estimated_arrival,
        originalDeadline
      );

      const scenarioExposure = exposure(
        scenario.estimated_arrival,
        scenarioDeadline
      );

      const comparison = (
        prediction: typeof baseline,
        deadline: Date,
        delayExposureInr: number
      ) => ({
        estimatedArrival: prediction.estimated_arrival,
        deadline: deadline.toISOString(),
        riskStatus: prediction.risk_status,
        remainingMinutes: prediction.remaining_minutes,
        slackMinutes: prediction.slack_minutes,
        lateByMinutes: prediction.predicted_late_by_minutes,
        delayExposureInr,
      });

      res.json({
        previewOnly: true,
        calculatedAt: scenario.calculated_at,
        delayCostPerHour: costPerHour,
        locationStale: assessment.locationStale,

        baseline: comparison(
          baseline,
          originalDeadline,
          baselineExposure
        ),

        scenario: comparison(
          scenario,
          scenarioDeadline,
          scenarioExposure
        ),

        additionalCostInr: options.additionalCostInr,

        hypotheticalNetBenefitInr: Math.round(
          (
            baselineExposure -
            scenarioExposure -
            options.additionalCostInr
          ) * 100
        ) / 100,

        assumptions: {
          speedFactor: options.speedFactor,
          extraDelayMinutes: options.extraDelayMinutes,
          deadlineShiftMinutes: options.deadlineShiftMinutes,
          estimateBasis: assessment.estimateBasis,
        },
      });
    } catch (error) {
      if (error instanceof ShipmentETAError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      console.error("What-if simulation:", error);

      res.status(503).json({
        message: "Simulation unavailable. Check the Python service.",
      });
    }
  }
);

// Read-only logistics copilot.
// Reuses the workspace visibility rule for every database request.

const copilotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Too many Copilot requests. Please try again later.",
  },
});

const copilotSchema = z.object({
  question: z.string().trim().min(3).max(500),
  shipmentId: z.uuid().optional(),

  mode: z.enum(["rules", "chat"]).default("chat"),

  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(800),
    }).strict()
  ).max(8).default([]),
}).strict();

interface CopilotRow {
  id: string;
  trackingCode: string;
  originCity: string;
  destinationCity: string;
  status: string;
  trackingStatus: string;
  deadline: Date | string;
  carrierName: string | null;
  riskStatus: string | null;
  estimatedArrival: Date | string | null;
  evaluatedAt: Date | string | null;
  assessmentFresh: boolean;
  locationFresh: boolean;
  delayExposureInr: number | null;
  recoveryLabel: string | null;
  savedProposalCount: number;
}


router.post(
  "/copilot",
  copilotLimiter,
  async (req: AuthRequest, res) => {

    res.setHeader("Cache-Control", "no-store");

    const parsed = copilotSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Enter a question of 3–500 characters.",
      });
      return;
    }

    const { question, shipmentId } = parsed.data;

    const intent =
      /recover|alternative|proposal|transfer/i.test(question)
        ? "recovery"
        : /cost|financial|impact|exposure|money/i.test(question)
          ? "financial"
          : /why|explain/i.test(question)
            ? "explain"
            : /risk|attention|urgent|late|delay|priority/i.test(question)
              ? "attention"
              : /summary|summarize|overview|shipment|status/i.test(question)
                ? "summary"
                : "help";



    try {
      const result = await db.query<CopilotRow>(
        `
        SELECT
          s.id,
          s.tracking_code AS "trackingCode",
          s.origin_city AS "originCity",
          s.destination_city AS "destinationCity",
          s.status,
          s.deadline,

          COALESCE(milestone.milestone, s.status)
            AS "trackingStatus",

          carrier.name AS "carrierName",
          state.risk_status AS "riskStatus",
          state.estimated_arrival AS "estimatedArrival",
          state.evaluated_at AS "evaluatedAt",

          (
            state.evaluated_at IS NOT NULL
            AND state.evaluated_at >= NOW() - INTERVAL '2 minutes'
          ) AS "assessmentFresh",

          (
            location.occurred_at IS NOT NULL
            AND location.occurred_at >= NOW() - INTERVAL '2 minutes'
          ) AS "locationFresh",

          CASE
            WHEN s.status = 'booked'
              AND COALESCE(milestone.milestone, 'booked') <> 'delivered'
              AND state.evaluated_at >= NOW() - INTERVAL '2 minutes'
            THEN ROUND(
              (
                GREATEST(
                  0,
                  EXTRACT(
                    EPOCH FROM (state.estimated_arrival - s.deadline)
                  ) / 3600
                ) * s.delay_cost_per_hour
              )::numeric,
              2
            )::float8
            ELSE NULL
          END AS "delayExposureInr",

          s.recovery_route->>'label' AS "recoveryLabel",

          (
            SELECT COUNT(*)::integer
            FROM public.shipment_recovery_proposals proposal
            WHERE proposal.shipment_id = s.id
              AND proposal.booking_id = booking.id
              AND proposal.original_lane_id = booking.carrier_lane_id
              AND proposal.status = 'pending'
              AND proposal.expires_at > NOW()
          ) AS "savedProposalCount"

        FROM public.shipments s

        LEFT JOIN public.shipment_bookings booking
          ON booking.shipment_id = s.id

        LEFT JOIN public.carrier_service_lanes lane
          ON lane.id = booking.carrier_lane_id

        LEFT JOIN public.carriers carrier
          ON carrier.id = lane.carrier_id

        LEFT JOIN public.shipment_sla_state state
          ON state.shipment_id = s.id

        LEFT JOIN LATERAL (
          SELECT event.milestone
          FROM public.shipment_tracking_events event
          WHERE event.shipment_id = s.id
            AND event.event_type = 'milestone'
          ORDER BY event.occurred_at DESC, event.id DESC
          LIMIT 1
        ) milestone ON TRUE

        LEFT JOIN LATERAL (
          SELECT event.occurred_at
          FROM public.shipment_tracking_events event
          WHERE event.shipment_id = s.id
            AND event.latitude IS NOT NULL
            AND event.longitude IS NOT NULL
          ORDER BY event.occurred_at DESC, event.id DESC
          LIMIT 1
        ) location ON TRUE

        WHERE ${visibility}
          AND ($3::uuid IS NULL OR s.id = $3::uuid)

        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 201
      `,
        [
          req.authUser!.id,
          req.authUser!.role,
          shipmentId ?? null,
        ]
      );

      if (shipmentId && result.rows.length === 0) {
        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      const limited = result.rows.length > 200;
      const rows = result.rows.slice(0, 200);
      const now = Date.now();

      const isActive = (shipment: CopilotRow) =>
        shipment.status === "booked" &&
        shipment.trackingStatus !== "delivered";

      const active = rows.filter(isActive);

      const needsAttention = (shipment: CopilotRow) =>
        isActive(shipment) &&
        (
          new Date(shipment.deadline).getTime() <= now ||
          !shipment.assessmentFresh ||
          !shipment.locationFresh ||
          (
            shipment.assessmentFresh &&
            shipment.riskStatus !== "On Track"
          )
        );

      const attention = rows.filter(needsAttention);

      const money = (value: number) =>
        new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(value);

      const reasons = (shipment: CopilotRow): string[] => {
        if (shipment.trackingStatus === "delivered") {
          return ["Delivery has been recorded."];
        }

        if (shipment.status !== "booked") {
          return [
            `Shipment status is ${shipment.status}. ` +
            "An active booking is required for operational ETA assessment.",
          ];
        }

        const messages: string[] = [];

        if (new Date(shipment.deadline).getTime() <= now) {
          messages.push(
            "The deadline has passed and delivery has not been recorded."
          );
        }

        if (!shipment.assessmentFresh) {
          messages.push(
            "The SLA assessment is missing or older than two minutes. " +
            "A current risk conclusion is unavailable."
          );
        } else {
          messages.push(
            `Latest SLA assessment: ${shipment.riskStatus ?? "Unknown"}.`
          );

          if (shipment.estimatedArrival) {
            const slack = Math.round(
              (
                new Date(shipment.deadline).getTime() -
                new Date(shipment.estimatedArrival).getTime()
              ) / 60_000
            );

            messages.push(
              slack >= 0
                ? `Estimated arrival has approximately ${slack} minutes of deadline buffer.`
                : `Estimated arrival misses the deadline by approximately ${Math.abs(slack)} minutes.`
            );
          }
        }

        if (!shipment.locationFresh) {
          messages.push(
            "The latest location is missing or older than two minutes. " +
            "Record a fresh carrier location."
          );
        }

        if (shipment.delayExposureInr !== null) {
          messages.push(
            `Predicted delay exposure: ${money(shipment.delayExposureInr)}.`
          );
        }

        return messages;
      };

      let selected = rows;
      let answer: string;

      if (intent === "financial") {
        const known = active.filter(
          (shipment) => shipment.delayExposureInr !== null
        );

        const total = known.reduce(
          (sum, shipment) => sum + (shipment.delayExposureInr ?? 0),
          0
        );

        answer =
          `Known predicted delay exposure is ${money(total)} across ` +
          `${known.length} active shipments with fresh assessments. ` +
          `${active.length - known.length} active shipments have unknown ` +
          "exposure. This estimate uses predicted late hours multiplied " +
          "by the configured hourly delay cost; it is not an invoice.";

        selected = [...active].sort(
          (a, b) =>
            (b.delayExposureInr ?? -1) -
            (a.delayExposureInr ?? -1)
        );
      } else if (intent === "recovery") {
        selected = active;

        const count = active.reduce(
          (sum, shipment) => sum + shipment.savedProposalCount,
          0
        );

        answer =
          `There are ${count} unexpired saved pending recovery proposals ` +
          "for the current bookings in this scope. Saved proposals still " +
          "need eligibility and position checks during approval. " +
          "An assigned Dispatcher can generate current alternatives " +
          "in the Recovery workspace.";
      } else if (intent === "attention") {
        selected = attention;

        answer =
          `${attention.length} of ${active.length} active shipments need ` +
          "attention because of deadline risk, a passed deadline, " +
          "a stale assessment, or a stale location.";
      } else if (intent === "explain") {
        answer = shipmentId
          ? "The supporting shipment evidence is shown below. " +
          "The records explain the calculated risk, but do not prove " +
          "a real-world cause such as traffic or vehicle failure."
          : "Select a shipment with Inspect for a focused explanation. " +
          "Below are the current attention cases.";

        selected = shipmentId ? rows : attention;
      } else {
        const delivered = rows.filter(
          (shipment) => shipment.trackingStatus === "delivered"
        ).length;

        answer =
          `This scope contains ${rows.length} shipments: ` +
          `${active.length} active bookings and ${delivered} delivered. ` +
          `${attention.length} active shipments need attention.`;

        selected = [
          ...attention,
          ...rows.filter((shipment) => !needsAttention(shipment)),
        ];
      }

      const generatedAt = new Date().toISOString();

      const scope = shipmentId
        ? "Selected authorized shipment."
        : limited
          ? "Latest 200 authorized shipments; older records are excluded."
          : `${rows.length} authorized shipments.`;

      const supportingShipments = selected.slice(0, 10).map(
        (shipment) => ({
          id: shipment.id,
          trackingCode: shipment.trackingCode,
          route: `${shipment.originCity} → ${shipment.destinationCity}`,
          trackingStatus: shipment.trackingStatus,
          carrierName: shipment.carrierName,
          evaluatedAt: shipment.evaluatedAt,

          estimatedArrival:
            shipment.assessmentFresh && isActive(shipment)
              ? shipment.estimatedArrival
              : null,

          deadline: shipment.deadline,
          reasons: reasons(shipment),
          recoveryLabel: shipment.recoveryLabel,
          savedProposalCount: shipment.savedProposalCount,
        })
      );


      let aiSummary: string | null = null;
      let aiUnavailable: string | null = null;

      if (parsed.data.mode === "chat") {
        try {
          // Send a bounded snapshot from the authorized database query.
          const aiShipments = supportingShipments.map((shipment) => ({
            trackingCode: shipment.trackingCode,
            route: shipment.route.slice(0, 160),
            trackingStatus: shipment.trackingStatus,
            carrierName:
              shipment.carrierName?.slice(0, 120) ?? null,
            evaluatedAt: shipment.evaluatedAt,
            estimatedArrival: shipment.estimatedArrival,
            deadline: shipment.deadline,
            reasons: shipment.reasons,
            recoveryLabel:
              shipment.recoveryLabel?.slice(0, 160) ?? null,
            savedProposalCount: shipment.savedProposalCount,
          }));

          const reply = await generateGroqCopilotReply({
            question,
            history: parsed.data.history,
            snapshot: {
              checkedAt: generatedAt,
              scope,
              requestedView: intent,
              factualSummary: answer,
              matchingShipmentCount: selected.length,
              supportingCardCount: aiShipments.length,
              shipments: aiShipments,
            },
          });

          aiSummary = reply.answer;

          if (reply.truncated) {
            aiUnavailable =
              "The AI explanation was shortened. Select one shipment " +
              "or ask a more specific question for a complete answer.";
          }
        } catch (error) {
          // Preserve the deterministic facts if AI is unavailable.
          aiUnavailable =
            error instanceof Error
              ? error.message
              : "AI summary is temporarily unavailable.";
        }
      }

      res.json({
        answer,
        aiSummary,
        aiUnavailable,
        generatedAt,
        scope,
        shipments: supportingShipments,
      });
    } catch (error) {
      console.error("Workspace copilot:", error);

      res.status(503).json({
        message: "Copilot data is temporarily unavailable.",
      });
    }
  });

export default router;