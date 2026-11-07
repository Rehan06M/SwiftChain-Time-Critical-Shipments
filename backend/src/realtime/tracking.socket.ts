import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { db } from "../config/db.js";
import type { AuthUser } from "../middleware/auth.js";

async function authenticate(
  cookieHeader?: string,
  ticket?: string
): Promise<AuthUser> {
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("swiftchain_session="));


  const usingTicket =
    typeof ticket === "string" && ticket.length > 0;

  const token = usingTicket
    ? ticket
    : cookie
      ? decodeURIComponent(
        cookie.slice("swiftchain_session=".length)
      )
      : undefined;


  const secret = process.env.JWT_SECRET;

  if (!token || !secret) {
    throw new Error("Authentication required");
  }


  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    ...(usingTicket
      ? { audience: "swiftchain-socket" }
      : {}),
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


async function validateConnectedUser(
  user: AuthUser
): Promise<void> {
  const result = await db.query(
    `
      SELECT role, is_active, session_version
      FROM public.users
      WHERE id = $1
    `,
    [user.id]
  );

  const account = result.rows[0];

  if (
    !account?.is_active ||
    account.role !== user.role ||
    account.session_version !== user.sessionVersion
  ) {
    throw new Error("Session no longer valid");
  }
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

      const ticket =
        typeof socket.handshake.auth?.ticket === "string"
          ? socket.handshake.auth.ticket
          : undefined;

      socket.data.user = await authenticate(
        socket.handshake.headers.cookie,
        ticket
      );


      next();
    } catch {
      next(new Error("Authentication required"));
    }
  });

  io.on("connection", (socket) => {
    // Recheck expiry, logout, and account changes.

    const connectedAt = Date.now();

    const sessionCheck = setInterval(() => {
      if (
        Date.now() - connectedAt >=
        8 * 60 * 60 * 1000
      ) {
        socket.disconnect(true);
        return;
      }

      void validateConnectedUser(
        socket.data.user as AuthUser
      ).catch(() => socket.disconnect(true));
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
            : () => { };

        const parsed = z.uuid().safeParse(shipmentId);

        if (!parsed.success) {
          reply({ ok: false, message: "Invalid shipment ID" });
          return;
        }

        try {

          const user = socket.data.user as AuthUser;

          await validateConnectedUser(user);


          const result = await db.query(
            `
    SELECT s.id
    FROM public.shipments s
    WHERE s.id = $1
      AND (
        (
          $3 = 'shipper'
          AND s.created_by = $2
        )
        OR (
          $3 = 'dispatcher'
          AND EXISTS (
            SELECT 1
            FROM public.shipment_dispatchers sd
            WHERE sd.shipment_id = s.id
              AND sd.user_id = $2
          )
        )
        OR (
          $3 = 'carrier'
          AND EXISTS (
            SELECT 1
            FROM public.shipment_bookings b
            JOIN public.carrier_service_lanes l
              ON l.id = b.carrier_lane_id
            JOIN public.carrier_accounts ca
              ON ca.carrier_id = l.carrier_id
            WHERE b.shipment_id = s.id
              AND ca.user_id = $2
          )
        )
      )
  `,
            [parsed.data, user.id, user.role]
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