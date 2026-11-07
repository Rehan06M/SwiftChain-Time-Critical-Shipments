
import "dotenv/config";
import path from "node:path";
import shipmentRoutes from "./routes/shipment.routes.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import carrierRoutes from "./routes/carrier.routes.js";
import commerceRoutes from "./routes/commerce.routes.js";
import { spawn, type ChildProcess } from "node:child_process";

import { verifyDatabase, db } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "./middleware/auth.js";
import { createServer } from "node:http";

import trackingRoutes from "./routes/tracking.routes.js";
import { attachTrackingSocket } from "./realtime/tracking.socket.js";
import alertRoutes from "./routes/alert.routes.js";
import recoveryRoutes from "./routes/recovery.routes.js";
import transitRecoveryRoutes from "./routes/transit-recovery.routes.js";

import workspaceRoutes from "./routes/workspace.routes.js";

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT ?? 5000);

const frontendUrl =
  process.env.FRONTEND_URL ?? "http://localhost:5173";

const trackingIo = attachTrackingSocket(
  httpServer,
  frontendUrl
);

app.set("trackingIo", trackingIo);

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error("Set a strong JWT_SECRET in backend/.env");
}

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginOpenerPolicy: {
      policy: "same-origin-allow-popups",
    },
  })
);


app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  })
);

app.use(express.json({ limit: "20kb" }));

app.use("/api/auth", (_req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  res.setHeader("Pragma", "no-cache");

  next();
});

app.use("/api/dashboard", (_req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  res.setHeader("Pragma", "no-cache");

  next();
});

app.use(cookieParser());

// Reject cross-origin state-changing requests.
// Protects cookie-authenticated operations.
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.origin;

    if (origin !== frontendUrl) {
      res.status(403).json({
        message: "Request origin not allowed",
      });
      return;
    }
  }

  next();
});

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      service: "SwiftChain Backend",
      status: "running",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      service: "SwiftChain Backend",
      status: "unavailable",
      database: "disconnected",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/carriers", carrierRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/recovery", recoveryRoutes);
app.use("/api/transit-recovery", transitRecoveryRoutes);
app.use("/api/workspace", workspaceRoutes);
// Prevent caching of pricing and booking responses
app.use("/api/commerce", (_req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  next();
});

// Register Step 7 Commerce APIs
app.use("/api/commerce", commerceRoutes);

// Temporary protected role endpoints.
// Functional dashboards will be built later.
const roles = [
  "shipper",
  "dispatcher",
  "carrier",
] as const;

for (const role of roles) {
  app.get(
    `/api/dashboard/${role}`,
    requireAuth,
    requireRole(role),
    async (req: AuthRequest, res) => {
      try {
        const result = await db.query(
          "SELECT role, is_active FROM users WHERE id = $1",
          [req.authUser!.id]
        );

        const account = result.rows[0];

        if (!account?.is_active) {
          res.status(401).json({
            message: "Account unavailable",
          });
          return;
        }

        if (account.role !== role) {
          res.status(403).json({
            message: "Access denied",
          });
          return;
        }

        res.json({
          message: `${role} dashboard access granted`,
        });
      } catch {
        res.status(500).json({
          message: "Unable to verify dashboard access",
        });
      }
    }
  );
}


/*
 * Production deployment:
 * Serve the built React frontend from Express.
 * API and Socket.IO remain on the same origin.
 */

// Return JSON for unknown API requests.
app.use("/api", (_req, res) => {
  res.status(404).json({
    message: "API route not found",
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({
    message: "API route not found",
  });
});

app.use((_req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((
  error: Error,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  console.error("Unhandled error:", error);



  res.status(500).json({
    message: "Internal server error",
  });
});


let slaWorkerProcess: ChildProcess | null = null;

function startSlaWorker(): void {
  if (process.env.RUN_SLA_WORKER !== "true") {
    console.log("[SLA] Embedded worker disabled");
    return;
  }

  if (slaWorkerProcess) return;

  slaWorkerProcess = spawn(
    process.execPath,
    ["dist/workers/sla.worker.js"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    }
  );

  slaWorkerProcess.on("error", (error) => {
    console.error("[SLA] Process error:", error);
  });

  slaWorkerProcess.on("exit", (code, signal) => {
    console.error(
      `[SLA] Worker exited: code=${code}, signal=${signal}`
    );

    slaWorkerProcess = null;
  });

  console.log("[SLA] Worker process launched");
}

function stopSlaWorker(): void {
  if (
    slaWorkerProcess &&
    !slaWorkerProcess.killed
  ) {
    slaWorkerProcess.kill("SIGTERM");
  }
}

process.on("SIGTERM", stopSlaWorker);
process.on("SIGINT", stopSlaWorker);

verifyDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(
        `SwiftChain API listening on port ${PORT}`
      );

      startSlaWorker();
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });

