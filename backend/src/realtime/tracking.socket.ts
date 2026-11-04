import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { db } from "../config/db.js";
import type { AuthUser } from "../middleware/auth.js";

async function authenticate(cookieHeader?: string): Promise<AuthUser> {
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("swiftchain_session="));

  const token = cookie
    ? decodeURIComponent(cookie.slice("swiftchain_session=".length))
    : undefined;

  const secret = process.env.JWT_SECRET;

  if (!token || !secret) {
    throw new Error("Authentication required");
  }

  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  });

  if (
    typeof decoded !== "object" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.sessionVersion !== "number"
  ) {
    throw new Error("Invalid session");
  }

  const result = await db.query(
    `
      SELECT id, role, is_active, session_version
      FROM public.users
      WHERE id = $1
    `,
    [decoded.sub]
  );

  const user = result.rows[0];

  if (
    !user?.is_active ||
    user.role !== decoded.role ||
    user.session_version !== decoded.sessionVersion
  ) {
    throw new Error("Session no longer valid");
  }

  return {
    id: user.id,
    role: user.role,
    sessionVersion: user.session_version,
  };
}

export function attachTrackingSocket(
  httpServer: HttpServer,
  frontendUrl: string
) {
  const io = new Server(httpServer, {
    cors: {
      origin: frontendUrl,
      credentials: true,
    },

    // Also check WebSocket origins.
    allowRequest: (req, callback) => {
      callback(null, req.headers.origin === frontendUrl);
    },
  });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticate(
        socket.handshake.headers.cookie
      );

      next();
    } catch {
      next(new Error("Authentication required"));
    }
  });

  io.on("connection", (socket) => {
    // Recheck expiry, logout, and account changes.
    const sessionCheck = setInterval(() => {
      void authenticate(socket.handshake.headers.cookie)
        .catch(() => socket.disconnect(true));
    }, 30_000);

    socket.on("disconnect", () => {
      clearInterval(sessionCheck);
    });

    socket.on(
      "tracking:subscribe",
      async (
        shipmentId: unknown,
        acknowledge?: (result: {
          ok: boolean;
          message?: string;
        }) => void
      ) => {
        const reply =
          typeof acknowledge === "function"
            ? acknowledge
            : () => {};

        const parsed = z.uuid().safeParse(shipmentId);

        if (!parsed.success) {
          reply({ ok: false, message: "Invalid shipment ID" });
          return;
        }

        try {
          const user = await authenticate(
            socket.handshake.headers.cookie
          );

          const result = await db.query(
            `
              SELECT id
              FROM public.shipments
              WHERE id = $1 AND created_by = $2
            `,
            [parsed.data, user.id]
          );

          if (!result.rows[0]) {
            reply({ ok: false, message: "Shipment not found" });
            return;
          }

          // This socket watches one shipment at a time.
          for (const room of socket.rooms) {
            if (room.startsWith("shipment:")) {
              await socket.leave(room);
            }
          }

          await socket.join(`shipment:${parsed.data}`);

          reply({ ok: true });
        } catch {
          reply({
            ok: false,
            message: "Unable to subscribe to tracking",
          });
        }
      }
    );

    socket.on("tracking:unsubscribe", async () => {
      for (const room of socket.rooms) {
        if (room.startsWith("shipment:")) {
          await socket.leave(room);
        }
      }
    });
  });

  return io;
}