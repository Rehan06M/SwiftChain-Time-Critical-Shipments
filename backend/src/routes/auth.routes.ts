import { OAuth2Client } from "google-auth-library";
import { Router } from "express";
import type { Response } from "express";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";

import { db } from "../config/db.js";
import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

const router = Router();
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  organizationName: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(72),
  role: z.enum(["shipper", "dispatcher", "carrier"]).default("shipper"),
  carrierId: z.uuid().optional(),
  inviteCode: z.string().max(128).optional(),
});

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Please try again later.",
  },
});

const cookieName = "swiftchain_session";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};


async function issueSession(
  res: Response,
  id: string,
  role: string
): Promise<void> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }

  const result = await db.query(
    `SELECT session_version
     FROM public.users
     WHERE id = $1 AND is_active = TRUE`,
    [id]
  );

  if (!result.rows[0]) {
    throw new Error("Cannot create session");
  }

  const token = jwt.sign(
    {
      role,
      sessionVersion: result.rows[0].session_version,
    },
    secret,
    {
      subject: id,
      expiresIn: "8h",
      algorithm: "HS256",
    }
  );

  res.cookie(cookieName, token, {
    ...cookieOptions,
    maxAge: 8 * 60 * 60 * 1000,
  });
}


function publicUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    organizationName: user.organization_name,
    role: user.role,
  };
}

// Public carrier catalogue for invite-controlled registration.
router.get("/registration-carriers", async (_req, res) => {
  try {
    const result = await db.query("SELECT id, name FROM public.carriers WHERE is_active = TRUE ORDER BY name");
    res.json({ carriers: result.rows });
  } catch (error) {
    console.error("Registration carriers:", error);
    res.status(503).json({ message: "Carrier companies unavailable" });
  }
});

// Ordinary signup is shipper-only unless the user presents a private invitation.
router.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Please check your registration details.", errors: parsed.error.flatten() });
    return;
  }
  const { fullName, email, organizationName, password, role, carrierId, inviteCode } = parsed.data;
  if (role !== "shipper") {
    const secret = process.env.ROLE_SIGNUP_INVITE_CODE;
    if (!secret || secret.length < 16 || !inviteCode) {
      res.status(403).json({ message: "A valid role invitation is required" });
      return;
    }
    const digest = (text: string) => createHash("sha256").update(text).digest();
    if (!timingSafeEqual(digest(secret), digest(inviteCode))) {
      res.status(403).json({ message: "Invalid role invitation" });
      return;
    }
  }
  if (role === "carrier" && !carrierId) {
    res.status(400).json({ message: "Select a carrier company" });
    return;
  }
  if (role !== "carrier" && carrierId) {
    res.status(400).json({ message: "Only carrier accounts can select a carrier company" });
    return;
  }
  let client;
  try {
    const hash = await bcrypt.hash(password, 12);
    client = await db.connect();
    await client.query("BEGIN");
    if (role === "carrier") {
      const company = await client.query("SELECT 1 FROM public.carriers WHERE id = $1 AND is_active = TRUE", [carrierId]);
      if (!company.rows[0]) {
        await client.query("ROLLBACK");
        res.status(400).json({ message: "Selected carrier company not found" });
        return;
      }
    }
    const result = await client.query(
      `INSERT INTO public.users (id, full_name, email, organization_name, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, full_name, email, organization_name, role`,
      [randomUUID(), fullName, email, organizationName, hash, role]
    );
    const user = result.rows[0];
    if (role === "carrier") {
      await client.query("INSERT INTO public.carrier_accounts (user_id, carrier_id) VALUES ($1,$2)", [user.id, carrierId]);
    }
    await client.query("COMMIT");
    await issueSession(res, user.id, user.role);
    res.status(201).json({ message: "Account created successfully", user: publicUser(user) });
  } catch (error: unknown) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ message: "An account with this email already exists" });
      return;
    }
    console.error("Registration error:", error);
    res.status(500).json({ message: "Unable to create account" });
  } finally {
    client?.release();
  }
});

// LOGIN
router.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Enter a valid email and password",
    });
    return;
  }

  try {
    const result = await db.query(
      `
        SELECT
          id, full_name, email,
          organization_name, password_hash,
          role, is_active
        FROM users
        WHERE email = $1
      `,
      [parsed.data.email]
    );

    const user = result.rows[0];

    // Same error for unknown emails and wrong passwords.
    if (!user || !user.is_active || !user.password_hash) {
      res.status(401).json({
        message: "Invalid email or password",
      });
      return;
    }

    const valid = await bcrypt.compare(
      parsed.data.password,
      user.password_hash
    );

    if (!valid) {
      res.status(401).json({
        message: "Invalid email or password",
      });
      return;
    }

    await issueSession(res, user.id, user.role);

    res.json({
      message: "Login successful",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Unable to sign in",
    });
  }
});

// CURRENT USER
router.get(
  "/me",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const result = await db.query(
        `
          SELECT
            id, full_name, email,
            organization_name, role, is_active
          FROM users
          WHERE id = $1
        `,
        [req.authUser!.id]
      );

      const user = result.rows[0];

      if (!user || !user.is_active) {
        res.status(401).json({
          message: "Account unavailable",
        });
        return;
      }

      res.json({
        user: publicUser(user),
      });
    } catch (error) {
      console.error("Session lookup error:", error);

      res.status(500).json({
        message: "Unable to verify session",
      });
    }
  }
);

// logout
router.post(
  "/logout",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      await db.query(
        `UPDATE public.users
         SET session_version = session_version + 1
         WHERE id = $1`,
        [req.authUser!.id]
      );

      res.clearCookie(cookieName, cookieOptions);

      res.setHeader("Cache-Control", "no-store");

      res.json({
        message: "Logged out successfully",
      });
    } catch (error) {
      console.error("Logout error:", error);

      res.status(500).json({
        message: "Unable to log out",
      });
    }
  }
);



// GOOGLE AUTHENTICATION
router.post("/google", authLimiter, async (req, res) => {
  const schema = z.object({
    credential: z.string().min(50),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid Google authentication request",
    });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    res.status(503).json({
      message: "Google authentication is not configured",
    });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (
      !payload ||
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      res.status(401).json({
        message: "Google account could not be verified",
      });
      return;
    }

    const googleSub = payload.sub;
    const email = payload.email.trim().toLowerCase();

    const fullName =
      (payload.name || email.split("@")[0])
        .trim()
        .slice(0, 120);

    // Look up by Google's stable subject ID first.
    const existingGoogle = await db.query(
      `
        SELECT
          id, full_name, email,
          organization_name, role, is_active
        FROM users
        WHERE google_sub = $1
      `,
      [googleSub]
    );

    let user = existingGoogle.rows[0];

    if (!user) {
      // Do not automatically link email/password accounts.
      const existingEmail = await db.query(
        "SELECT id FROM users WHERE email = $1",
        [email]
      );

      if (existingEmail.rowCount) {
        res.status(409).json({
          message:
            "An account with this email already exists. " +
            "Sign in with your password instead.",
        });
        return;
      }

      const created = await db.query(
        `
          INSERT INTO users (
            id,
            full_name,
            email,
            organization_name,
            password_hash,
            google_sub,
            role
          )
          VALUES ($1, $2, $3, NULL, NULL, $4, 'shipper')
          RETURNING
            id, full_name, email,
            organization_name, role, is_active
        `,
        [
          randomUUID(),
          fullName,
          email,
          googleSub,
        ]
      );

      user = created.rows[0];
    }

    if (!user.is_active) {
      res.status(403).json({
        message: "This account is inactive",
      });
      return;
    }

    await issueSession(res, user.id, user.role);

    res.json({
      message: "Google authentication successful",
      user: publicUser(user),
    });
  } catch (error: unknown) {
    // A concurrent request might have created
    // the same Google account or email.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({
        message:
          "Account already exists. Please retry signing in.",
      });
      return;
    }

    console.error("Google authentication failed:", error);

    res.status(401).json({
      message: "Google sign-in could not be completed",
    });
  }
});


export default router;
