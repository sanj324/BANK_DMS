const pool = require("../config/db");

module.exports = async (userId, action, entity, entityId) => {
  await pool.query(
    "INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES ($1,$2,$3,$4)",
    [userId, action, entity, entityId]
  );
};
