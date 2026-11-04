import { Router } from "express";
import { z } from "zod";

import { db } from "../config/db.js";
import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  evaluateShipmentETA,
  ShipmentETAError,
} from "../services/shipment-eta.service.js";

const router = Router();

router.use(requireAuth);

router.get("/:shipmentId", async (req: AuthRequest, res) => {
  const parsed = z.uuid().safeParse(req.params.shipmentId);

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid shipment ID",
    });
    return;
  }

  try {
    // Match the ownership rules used by the shipment API.
    const result = await db.query(
      `
        SELECT
          id,
          tracking_code AS "trackingCode",
          status,
          origin_city AS "originCity",
          destination_city AS "destinationCity",
          origin_latitude::float8 AS "originLatitude",
          origin_longitude::float8 AS "originLongitude",
          destination_latitude::float8 AS "destinationLatitude",
          destination_longitude::float8 AS "destinationLongitude"
        FROM public.shipments
        WHERE id = $1
          AND created_by = $2
      `,
      [parsed.data, req.authUser!.id]
    );

    const shipment = result.rows[0];

    if (!shipment) {
      res.status(404).json({
        message: "Shipment not found",
      });
      return;
    }

    const events = await db.query(
      `
        SELECT
          id,
          event_type AS "eventType",
          milestone,
          latitude::float8 AS latitude,
          longitude::float8 AS longitude,
          message,
          source,
          occurred_at AS "occurredAt"
        FROM public.shipment_tracking_events
        WHERE shipment_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 500
      `,
      [shipment.id]
    );

    const latestLocation = await db.query(
      `
        SELECT
          latitude::float8 AS latitude,
          longitude::float8 AS longitude,
          occurred_at AS "occurredAt",
          source
        FROM public.shipment_tracking_events
        WHERE shipment_id = $1
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1
      `,
      [shipment.id]
    );

    const latestMilestone = await db.query(
      `
        SELECT milestone
        FROM public.shipment_tracking_events
        WHERE shipment_id = $1
          AND event_type = 'milestone'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1
      `,
      [shipment.id]
    );

    res.setHeader("Cache-Control", "no-store");

    res.json({
      shipment,
      trackingStatus:
        latestMilestone.rows[0]?.milestone ??
        shipment.status,
      latestLocation: latestLocation.rows[0] ?? null,
      events: events.rows,
    });
  } catch (error) {
    console.error("Load tracking:", error);

    res.status(500).json({
      message: "Unable to load shipment tracking",
    });
  }
});

const milestones = [
  "booked",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

const trackingUpdateSchema = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal("location"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
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
    message: z.string().trim().max(500).optional(),
  }).strict(),
]);

router.post(
  "/:shipmentId/events",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);
    const parsed = trackingUpdateSchema.safeParse(req.body);

    if (!id.success || !parsed.success) {
      res.status(400).json({
        message: "Invalid tracking update",
      });
      return;
    }

    let client;

    try {
      client = await db.connect();

      await client.query("BEGIN");

      // Lock the shipment so concurrent updates are processed in order.
      const result = await client.query(
        `
          SELECT id, status
          FROM public.shipments
          WHERE id = $1 AND created_by = $2
          FOR UPDATE
        `,
        [id.data, req.authUser!.id]
      );

      const shipment = result.rows[0];

      if (!shipment) {
        await client.query("ROLLBACK");

        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      if (shipment.status !== "booked") {
        await client.query("ROLLBACK");

        res.status(409).json({
          message: "Tracking updates require a booked shipment",
        });
        return;
      }

      const latest = await client.query(
        `
          SELECT milestone
          FROM public.shipment_tracking_events
          WHERE shipment_id = $1
            AND event_type = 'milestone'
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1
        `,
        [id.data]
      );

      const currentMilestone =
        latest.rows[0]?.milestone ?? "booked";

      if (currentMilestone === "delivered") {
        await client.query("ROLLBACK");

        res.status(409).json({
          message: "This shipment has already been delivered",
        });
        return;
      }

      const input = parsed.data;

      if (input.eventType === "milestone") {
        const currentIndex = milestones.findIndex(
          (value) => value === currentMilestone
        );

        const nextMilestone = milestones[currentIndex + 1];

        if (
          currentIndex === -1 ||
          input.milestone !== nextMilestone
        ) {
          await client.query("ROLLBACK");

          res.status(409).json({
            message: nextMilestone
              ? `The next milestone must be ${nextMilestone}`
              : "Unable to advance this tracking status",
          });
          return;
        }
      }

      const eventId = randomUUID();

      await client.query(
        `
          INSERT INTO public.shipment_tracking_events (
            id,
            shipment_id,
            event_type,
            milestone,
            latitude,
            longitude,
            message,
            source,
            created_by,
            occurred_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            'simulator', $8, clock_timestamp()
          )
        `,
        [
          eventId,
          id.data,
          input.eventType,
          input.eventType === "milestone"
            ? input.milestone
            : null,
          input.eventType === "location"
            ? input.latitude
            : null,
          input.eventType === "location"
            ? input.longitude
            : null,
          input.message || null,
          req.authUser!.id,
        ]
      );

      await client.query("COMMIT");

      // Send an invalidation notice. Clients fetch the latest
      // tracking through the authenticated GET endpoint.
      const io = req.app.get("trackingIo") as Server | undefined;

      io?.to(`shipment:${id.data}`).emit("tracking:updated", {
        shipmentId: id.data,
      });

      res.status(201).json({
        message: "Tracking update saved",
        eventId,
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }

      console.error("Save tracking update:", error);

      res.status(500).json({
        message: "Unable to save tracking update",
      });
    } finally {
      client?.release();
    }
  }
);

const routeCoordinatesSchema = z.object({
  originLatitude: z.number().finite().min(-90).max(90),
  originLongitude: z.number().finite().min(-180).max(180),
  destinationLatitude: z.number().finite().min(-90).max(90),
  destinationLongitude: z.number().finite().min(-180).max(180),
}).strict();

router.put(
  "/:shipmentId/route",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.shipmentId);
    const parsed = routeCoordinatesSchema.safeParse(req.body);

    if (!id.success || !parsed.success) {
      res.status(400).json({
        message: "Enter valid route coordinates",
      });
      return;
    }

    let client;

    try {
      client = await db.connect();
      await client.query("BEGIN");

      const result = await client.query(
        `
          SELECT id, status
          FROM public.shipments
          WHERE id = $1 AND created_by = $2
          FOR UPDATE
        `,
        [id.data, req.authUser!.id]
      );

      const shipment = result.rows[0];

      if (!shipment) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "Shipment not found",
        });
        return;
      }

      const latest = await client.query(
        `
          SELECT milestone
          FROM public.shipment_tracking_events
          WHERE shipment_id = $1
            AND event_type = 'milestone'
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1
        `,
        [id.data]
      );

      if (
        shipment.status !== "booked" ||
        latest.rows[0]?.milestone === "delivered"
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "Route updates require an active booked shipment",
        });
        return;
      }

      const coordinates = parsed.data;

      await client.query(
        `
          UPDATE public.shipments
          SET
            origin_latitude = $1,
            origin_longitude = $2,
            destination_latitude = $3,
            destination_longitude = $4,
            updated_at = clock_timestamp()
          WHERE id = $5
        `,
        [
          coordinates.originLatitude,
          coordinates.originLongitude,
          coordinates.destinationLatitude,
          coordinates.destinationLongitude,
          id.data,
        ]
      );

      await client.query("COMMIT");

      const io = req.app.get("trackingIo") as Server | undefined;

      io?.to(`shipment:${id.data}`).emit("tracking:updated", {
        shipmentId: id.data,
      });

      res.json({
        message: "Route coordinates saved",
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }

      console.error("Save tracking route:", error);

      res.status(500).json({
        message: "Unable to save route coordinates",
      });
    } finally {
      client?.release();
    }
  }
);

router.get(
  "/:shipmentId/eta",
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
      const assessment = await evaluateShipmentETA(
        id.data,
        req.authUser!.id
      );

      res.json(assessment);
    } catch (error) {
      if (error instanceof ShipmentETAError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      console.error("Calculate shipment ETA:", error);

      res.status(503).json({
        message:
          "ETA is temporarily unavailable. Check the backend logs and Python service.",
      });
    }
  }
);

export default router;