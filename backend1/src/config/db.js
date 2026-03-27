const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "bank_dms",
  password: "postgres",
  port: 5432
});

module.exports = pool;
