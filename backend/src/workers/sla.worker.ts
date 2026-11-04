import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";

import { db } from "../config/db.js";
import {
  evaluateShipmentETA,
  ShipmentETAError,
} from "../services/shipment-eta.service.js";
import type { QueryResult } from "pg";

const redisUrl = new URL(
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
);

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username
    ? decodeURIComponent(redisUrl.username)
    : undefined,
  password: redisUrl.password
    ? decodeURIComponent(redisUrl.password)
    : undefined,
  db: Number(redisUrl.pathname.slice(1) || 0),
  ...(redisUrl.protocol === "rediss:"
    ? { tls: {} }
    : {}),
};

const interval = Number(
  process.env.SLA_MONITOR_INTERVAL_MS ?? 30000
);

if (!Number.isFinite(interval) || interval < 5000) {
  throw new Error(
    "SLA_MONITOR_INTERVAL_MS must be at least 5000"
  );
}

const queue = new Queue("swiftchain-sla", {
  connection,
});

async function assessShipment(shipmentId: string) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Serialize assessments with tracking and route updates.
    const shipmentResult = await client.query(
      `
        SELECT id, created_by, tracking_code, status
        FROM public.shipments
        WHERE id = $1
        FOR UPDATE
      `,
      [shipmentId]
    );

    const shipment = shipmentResult.rows[0];

    if (!shipment || shipment.status !== "booked") {
      await client.query("ROLLBACK");
      return;
    }

    const assessment = await evaluateShipmentETA(shipmentId);

    if (assessment.status === "delivered") {
      await client.query("ROLLBACK");
      return;
    }

    const prediction = assessment.prediction;

    const previousResult = await client.query(
      `
        SELECT risk_status, transition_version
        FROM public.shipment_sla_state
        WHERE shipment_id = $1
      `,
      [shipmentId]
    );

    const previous = previousResult.rows[0];

    const changed =
      previous?.risk_status !== prediction.risk_status;

    const version = previous
      ? (
          BigInt(previous.transition_version) +
          (changed ? 1n : 0n)
        ).toString()
      : "1";

    await client.query(
      `
        INSERT INTO public.shipment_sla_state (
          shipment_id,
          risk_status,
          estimated_arrival,
          remaining_minutes,
          slack_minutes,
          location_stale,
          transition_version,
          evaluated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (shipment_id)
        DO UPDATE SET
          risk_status = EXCLUDED.risk_status,
          estimated_arrival = EXCLUDED.estimated_arrival,
          remaining_minutes = EXCLUDED.remaining_minutes,
          slack_minutes = EXCLUDED.slack_minutes,
          location_stale = EXCLUDED.location_stale,
          transition_version = EXCLUDED.transition_version,
          evaluated_at = EXCLUDED.evaluated_at
      `,
      [
        shipmentId,
        prediction.risk_status,
        prediction.estimated_arrival,
        prediction.remaining_minutes,
        prediction.slack_minutes,
        assessment.locationStale,
        version,
        prediction.calculated_at,
      ]
    );

    // A first On Track assessment is silent.
    // Later changes, including recovery, produce notifications.
    const shouldNotify =
      changed &&
      (previous || prediction.risk_status !== "On Track");

    if (shouldNotify) {
      const recovered =
        prediction.risk_status === "On Track";

      const title = recovered
        ? `${shipment.tracking_code} is back on track`
        : `${shipment.tracking_code}: ${prediction.risk_status}`;

      const message = [
        prediction.explanation,
        `Estimated arrival: ${prediction.estimated_arrival}.`,
        assessment.locationStale
          ? "Location data is missing or stale; verify shipment progress."
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      await client.query(
        `
          INSERT INTO public.shipment_alerts (
            id,
            shipment_id,
            user_id,
            risk_status,
            title,
            message,
            transition_version
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (
            shipment_id,
            transition_version
          ) DO NOTHING
        `,
        [
          randomUUID(),
          shipmentId,
          shipment.created_by,
          prediction.risk_status,
          title,
          message,
          version,
        ]
      );
    }

    await client.query("COMMIT");

    console.log(
      `[SLA] ${shipment.tracking_code}: ${prediction.risk_status}`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function scanShipments() {
  let cursor: string | null = null;
  let failed = false;

  // Process in batches so all eligible shipments are visited.
  while (true) {
    const result: QueryResult<{ id: string }> =
  await db.query<{ id: string }>(
      `
        SELECT s.id
        FROM public.shipments s
        WHERE s.status = 'booked'
          AND ($1::uuid IS NULL OR s.id > $1::uuid)
          AND NOT EXISTS (
            SELECT 1
            FROM public.shipment_tracking_events e
            WHERE e.shipment_id = s.id
              AND e.milestone = 'delivered'
          )
        ORDER BY s.id
        LIMIT 100
      `,
      [cursor]
    );

    if (result.rows.length === 0) break;

    for (const shipment of result.rows) {
      try {
        await assessShipment(shipment.id);
      } catch (error) {
        if (
          error instanceof ShipmentETAError &&
          [404, 409].includes(error.statusCode)
        ) {
          console.warn(
            `[SLA] Skipped ${shipment.id}: ${error.message}`
          );
        } else {
          failed = true;
          console.error(
            `[SLA] Assessment failed for ${shipment.id}:`,
            error
          );
        }
      }
    }

    cursor = result.rows[result.rows.length - 1].id;
  }

  if (failed) {
    throw new Error(
      "Some SLA assessments failed; the scan will be retried"
    );
  }
}

const worker = new Worker(
  "swiftchain-sla",
  async () => {
    await scanShipments();
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on("failed", (job, error) => {
  console.error(
    `[SLA] Job ${job?.id} failed:`,
    error.message
  );
});

worker.on("error", (error) => {
  console.error("[SLA] Worker error:", error);
});

queue.on("error", (error) => {
  console.error("[SLA] Queue error:", error);
});

async function start() {
  await queue.upsertJobScheduler(
    "scheduled-sla-scan",
    {
      every: interval,
    },
    {
      name: "monitor-shipments",
      data: {},
      opts: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    }
  );

  console.log(
    `[SLA] Monitoring scheduled every ${interval / 1000} seconds`
  );
}

let stopping = false;

async function shutdown() {
  if (stopping) return;
  stopping = true;

  await worker.close();
  await queue.close();
  await db.end();
}

process.on("SIGINT", () => {
  void shutdown().catch(console.error);
});

process.on("SIGTERM", () => {
  void shutdown().catch(console.error);
});

start().catch(async (error) => {
  console.error("[SLA] Startup failed:", error);
  await shutdown();
  process.exitCode = 1;
});