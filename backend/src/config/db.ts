
import { Pool } from "pg";


export const db = new Pool(
  process.env.DATABASE_URL
    ? {
        // Neon PostgreSQL in production.
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
      }
    : {
        // Existing local PostgreSQL configuration.
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      }
);


db.on("error", (error) => {
  console.error("PostgreSQL pool error:", error.message);
});

export async function verifyDatabase() {
  const result = await db.query("SELECT NOW() AS time");

  console.log(
    "PostgreSQL connected:",
    result.rows[0].time
  );
}
