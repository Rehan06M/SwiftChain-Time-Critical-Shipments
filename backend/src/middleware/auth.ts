
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

export type UserRole =
  | "shipper"
  | "dispatcher"
  | "carrier";

export interface AuthUser {
  id: string;
  role: UserRole;
  sessionVersion: number;
}

export interface AuthRequest extends Request {
  authUser?: AuthUser;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.swiftchain_session;

  if (!token || typeof token !== "string") {
    res.status(401).json({
      message: "Authentication required",
    });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT secret is missing");
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    if (
      typeof decoded !== "object" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.role !== "string" ||
      typeof decoded.sessionVersion !== "number"
    ) {
      res.status(401).json({
        message: "Invalid session",
      });
      return;
    }

    const result = await db.query(
      `SELECT id, role, is_active, session_version
       FROM public.users
       WHERE id = $1`,
      [decoded.sub]
    );

    const user = result.rows[0];

    if (
      !user ||
      !user.is_active ||
      user.role !== decoded.role ||
      user.session_version !== decoded.sessionVersion
    ) {
      res.status(401).json({
        message: "Session no longer valid",
      });
      return;
    }

    req.authUser = {
      id: user.id,
      role: user.role,
      sessionVersion: user.session_version,
    };

    next();
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      res.status(401).json({
        message: "Session expired or invalid",
      });
      return;
    }

    console.error("Session verification error:", error);

    res.status(500).json({
      message: "Unable to verify session",
    });
  }
}

export function requireRole(
  ...roles: UserRole[]
) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (
      !req.authUser ||
      !roles.includes(req.authUser.role)
    ) {
      res.status(403).json({
        message: "Access denied",
      });
      return;
    }

    next();
  };
}
