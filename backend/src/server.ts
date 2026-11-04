
import "dotenv/config";
import shipmentRoutes from "./routes/shipment.routes.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { verifyDatabase, db } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "./middleware/auth.js";

const app = express();
const PORT = Number(process.env.PORT ?? 5000);

const frontendUrl =
  process.env.FRONTEND_URL ?? "http://localhost:5173";

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

app.use((_req, res) => {
  res.status(404).json({
    message: "API route not found",
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

verifyDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `SwiftChain API running at http://localhost:${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });
