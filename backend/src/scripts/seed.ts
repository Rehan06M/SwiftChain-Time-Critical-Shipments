
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../config/db.js";

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Development seed script must not run in production"
    );
  }

  const password = process.env.DEV_SEED_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error(
      "Set DEV_SEED_PASSWORD to at least 12 characters"
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const accounts = [
    {
      name: "Demo Dispatcher",
      email: "dispatcher@swiftchain.test",
      organization: "SwiftChain Operations",
      role: "dispatcher",
    },
    {
      name: "Demo Carrier",
      email: "carrier@swiftchain.test",
      organization: "SwiftChain Carrier Network",
      role: "carrier",
    },
  ];

  for (const account of accounts) {
    await db.query(
      `
        INSERT INTO users (
          id, full_name, email,
          organization_name, password_hash, role
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO NOTHING
      `,
      [
        randomUUID(),
        account.name,
        account.email,
        account.organization,
        passwordHash,
        account.role,
      ]
    );

    console.log(`Provisioned if absent: ${account.email}`);
  }
}

seed()
  .then(async () => {
    console.log("Development account provisioning finished");
    await db.end();
  })
  .catch(async (error) => {
    console.error(error);
    await db.end();
    process.exitCode = 1;
  });
