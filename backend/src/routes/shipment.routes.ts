
import { Router } from "express";
import { randomUUID } from "node:crypto";

import { db } from "../config/db.js";
import {
    requireAuth,
    requireRole,
    type AuthRequest,
} from "../middleware/auth.js";

import {
    shipmentSchema,
    type ShipmentInput,
} from "../services/shipment.validation.js";

const router = Router();

router.use(requireAuth, requireRole("shipper"));

const shipmentSelect = `
  SELECT
    id,
    tracking_code AS "trackingCode",
    organization_id AS "organizationId",
    origin_city AS "originCity",
    origin_address AS "originAddress",
    destination_city AS "destinationCity",
    destination_address AS "destinationAddress",
    cargo_description AS "cargoDescription",
    cargo_type AS "cargoType",
    weight_kg::float8 AS "weightKg",
    deadline,
    delay_cost_per_hour::float8 AS "delayCostPerHour",
    notes,
    status,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM public.shipments
`;

function trackingCode() {
    return (
        "SH-" +
        randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()
    );
}

function values(input: ShipmentInput) {
    return [
        input.originCity,
        input.originAddress,
        input.destinationCity,
        input.destinationAddress,
        input.cargoDescription,
        input.cargoType,
        input.weightKg,
        input.deadline,
        input.delayCostPerHour,
        input.notes,
    ];
}


async function getWorkspace(userId: string) {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const user = await client.query(
            `
        SELECT id, full_name, organization_name
        FROM public.users
        WHERE id = $1 AND is_active = TRUE
        FOR UPDATE
      `,
            [userId]
        );

        if (!user.rows[0]) {
            await client.query("ROLLBACK");
            return undefined;
        }

        const account = user.rows[0];

        await client.query(
            `
        INSERT INTO public.organizations (
          id, name, created_by
        )
        VALUES ($1, $2, $1)
        ON CONFLICT (created_by) DO NOTHING
      `,
            [
                userId,
                account.organization_name?.trim() ||
                `${account.full_name} Workspace`,
            ]
        );

        await client.query(
            `
        UPDATE public.users u
        SET organization_id = o.id
        FROM public.organizations o
        WHERE u.id = $1
          AND o.created_by = u.id
          AND u.organization_id IS NULL
      `,
            [userId]
        );

        const result = await client.query(
            `
        SELECT organization_id AS id
        FROM public.users
        WHERE id = $1
      `,
            [userId]
        );

        await client.query("COMMIT");

        return result.rows[0]?.id as string | undefined;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// LIST THE CURRENT USER'S SHIPMENTS
router.get("/", async (req: AuthRequest, res) => {
    try {
        const workspace = await getWorkspace(req.authUser!.id);

        if (!workspace) {
            res.status(409).json({
                message: "Organization workspace is not configured",
            });
            return;
        }

        const result = await db.query(
            `
        ${shipmentSelect}
        WHERE organization_id = $1
          AND created_by = $2
        ORDER BY created_at DESC
        LIMIT 200
      `,
            [workspace, req.authUser!.id]
        );

        res.json({ shipments: result.rows });
    } catch (error) {
        console.error("List shipments:", error);
        res.status(500).json({
            message: "Unable to load shipments",
        });
    }
});

// CREATE A SHIPMENT
router.post("/", async (req: AuthRequest, res) => {
    const parsed = shipmentSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            message: "Please check the shipment details",
            errors: parsed.error.flatten(),
        });
        return;
    }

    try {
        const workspace = await getWorkspace(req.authUser!.id);

        if (!workspace) {
            res.status(409).json({
                message: "Organization workspace is not configured",
            });
            return;
        }

        const id = randomUUID();
        const code = trackingCode();

        await db.query(
            `
        INSERT INTO public.shipments (
          id, tracking_code, organization_id, created_by,
          origin_city, origin_address,
          destination_city, destination_address,
          cargo_description, cargo_type, weight_kg,
          deadline, delay_cost_per_hour, notes
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14
        )
      `,
            [
                id,
                code,
                workspace,
                req.authUser!.id,
                ...values(parsed.data),
            ]
        );

        const result = await db.query(
            `${shipmentSelect} WHERE id = $1`,
            [id]
        );

        res.status(201).json({
            message: "Shipment created successfully",
            shipment: result.rows[0],
        });
    } catch (error) {
        console.error("Create shipment:", error);
        res.status(500).json({
            message: "Unable to create shipment",
        });
    }
});

// GET ONE SHIPMENT
router.get("/:id", async (req: AuthRequest, res) => {
    try {
        const result = await db.query(
            `
        ${shipmentSelect}
        WHERE id = $1
          AND created_by = $2
      `,
            [req.params.id, req.authUser!.id]
        );

        if (!result.rows[0]) {
            res.status(404).json({
                message: "Shipment not found",
            });
            return;
        }

        res.json({ shipment: result.rows[0] });
    } catch (error) {
        console.error("Get shipment:", error);
        res.status(500).json({
            message: "Unable to load shipment",
        });
    }
});

// EDIT A CREATED SHIPMENT
router.put("/:id", async (req: AuthRequest, res) => {
    const parsed = shipmentSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            message: "Please check the shipment details",
            errors: parsed.error.flatten(),
        });
        return;
    }

    try {
        const result = await db.query(
            `
        UPDATE public.shipments
        SET
          origin_city = $1,
          origin_address = $2,
          destination_city = $3,
          destination_address = $4,
          cargo_description = $5,
          cargo_type = $6,
          weight_kg = $7,
          deadline = $8,
          delay_cost_per_hour = $9,
          notes = $10,
          updated_at = NOW()
        WHERE id = $11
          AND created_by = $12
          AND status = 'created'
        RETURNING id
      `,
            [
                ...values(parsed.data),
                req.params.id,
                req.authUser!.id,
            ]
        );

        if (!result.rows[0]) {
            res.status(404).json({
                message: "Shipment not found or cannot be edited",
            });
            return;
        }

        const updated = await db.query(
            `${shipmentSelect} WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            message: "Shipment updated successfully",
            shipment: updated.rows[0],
        });
    } catch (error) {
        console.error("Update shipment:", error);
        res.status(500).json({
            message: "Unable to update shipment",
        });
    }
});

// CANCEL A SHIPMENT
router.patch(
    "/:id/cancel",
    async (req: AuthRequest, res) => {
        try {
            const result = await db.query(
                `
          UPDATE public.shipments
          SET status = 'cancelled',
              updated_at = NOW()
          WHERE id = $1
            AND created_by = $2
            AND status = 'created'
          RETURNING id
        `,
                [req.params.id, req.authUser!.id]
            );

            if (!result.rows[0]) {
                res.status(404).json({
                    message: "Shipment not found or already cancelled",
                });
                return;
            }

            res.json({
                message: "Shipment cancelled successfully",
            });
        } catch (error) {
            console.error("Cancel shipment:", error);
            res.status(500).json({
                message: "Unable to cancel shipment",
            });
        }
    }
);

export default router;
