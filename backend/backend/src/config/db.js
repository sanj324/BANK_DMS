const { Pool } = require("pg");

const useSsl = String(process.env.DB_SSL || "false").toLowerCase() === "true";

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_DATABASE || "bank_dms",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

module.exports = pool;
