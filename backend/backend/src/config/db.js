const { Pool } = require("pg");

const useSsl = String(process.env.DB_SSL || "false").toLowerCase() === "true";
const databaseUrl = process.env.DATABASE_URL || "";

if (process.env.NODE_ENV === "production" && !databaseUrl && !process.env.DB_HOST) {
  throw new Error(
    "Database config missing. Set DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_DATABASE in environment."
  );
}

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    })
  : new Pool({
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_DATABASE || "bank_dms",
      password: process.env.DB_PASSWORD || "postgres",
      port: Number(process.env.DB_PORT || 5432),
      ssl: useSsl ? { rejectUnauthorized: false } : false
    });

module.exports = pool;
