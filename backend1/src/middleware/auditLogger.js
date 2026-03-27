/**
 * =========================================================
 * Audit Logger – Bank / NBFC Grade
 * =========================================================
 * Purpose:
 *  - Record all sensitive actions
 *  - Ensure traceability & non-repudiation
 *  - Must NEVER block main business flow
 */

const pool = require("../config/db");

/**
 * Write audit log entry
 *
 * @param {Object} params
 * @param {number} params.userId   - Logged-in user ID
 * @param {string} params.action   - Action performed
 * @param {string} params.entity   - Entity name (USER / DOCUMENT / etc.)
 * @param {number|null} params.entityId - Related entity ID
 */
async function auditLogger({ userId, action, entity, entityId = null }) {
  // Basic validation (do not throw)
  if (!userId || !action || !entity) {
    console.warn("AuditLogger skipped: missing required fields");
    return;
  }

  try {
    await pool.query(
      `
      INSERT INTO audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        timestamp
      )
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [userId, action, entity, entityId]
    );
  } catch (error) {
    // NEVER crash app due to audit failure
    console.error("AUDIT LOG ERROR:", error.message);
  }
}

module.exports = auditLogger;
