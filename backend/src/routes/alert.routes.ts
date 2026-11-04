import { Router } from "express";
import { z } from "zod";

import { db } from "../config/db.js";
import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const userId = req.authUser!.id;

    const [alerts, unread] = await Promise.all([
      db.query(
        `
          SELECT
            a.id,
            a.shipment_id AS "shipmentId",
            s.tracking_code AS "trackingCode",
            a.risk_status AS "riskStatus",
            a.title,
            a.message,
            a.created_at AS "createdAt",
            a.read_at AS "readAt"
          FROM public.shipment_alerts a
          JOIN public.shipments s
            ON s.id = a.shipment_id
          WHERE a.user_id = $1
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 50
        `,
        [userId]
      ),
      db.query(
        `
          SELECT COUNT(*)::integer AS count
          FROM public.shipment_alerts
          WHERE user_id = $1 AND read_at IS NULL
        `,
        [userId]
      ),
    ]);

    res.json({
      alerts: alerts.rows,
      unreadCount: unread.rows[0].count,
    });
  } catch (error) {
    console.error("List alerts:", error);

    res.status(500).json({
      message: "Unable to load notifications",
    });
  }
});

router.patch(
  "/:id/read",
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.id);

    if (!id.success) {
      res.status(400).json({
        message: "Invalid notification ID",
      });
      return;
    }

    try {
      const result = await db.query(
        `
          UPDATE public.shipment_alerts
          SET read_at = COALESCE(read_at, NOW())
          WHERE id = $1 AND user_id = $2
          RETURNING id
        `,
        [id.data, req.authUser!.id]
      );

      if (!result.rows[0]) {
        res.status(404).json({
          message: "Notification not found",
        });
        return;
      }

      res.json({
        message: "Notification marked as read",
      });
    } catch (error) {
      console.error("Mark notification read:", error);

      res.status(500).json({
        message: "Unable to update notification",
      });
    }
  }
);

export default router;