const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const { ADMIN_ROLES } = require("../config/policies");

const router = express.Router();

router.get("/summary", auth, async (req, res) => {
  try {
    if (!ADMIN_ROLES.has(req.user.role)) {
      return res.status(403).json({ message: "Only system administrators can access compliance reports" });
    }

    const [docs, access, expiredRetention, byType] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::int AS total_documents,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_documents,
          COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved_documents,
          COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_documents,
          COALESCE(SUM(file_size), 0)::bigint AS total_storage_bytes
        FROM documents
        `
      ),
      pool.query(
        `
        SELECT
          COUNT(*)::int AS access_events_24h
        FROM document_access_logs
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
        `
      ),
      pool.query(
        `
        SELECT
          COUNT(*)::int AS expired_retention_count
        FROM documents
        WHERE retention_until IS NOT NULL AND retention_until < NOW()
        `
      ),
      pool.query(
        `
        SELECT LOWER(regexp_replace(file_path, '^.*\\.', '')) AS extension,
               COUNT(*)::int AS count
        FROM documents
        GROUP BY extension
        ORDER BY count DESC
        `
      )
    ]);

    return res.json({
      generatedAt: new Date().toISOString(),
      documents: docs.rows[0],
      access: access.rows[0],
      retention: expiredRetention.rows[0],
      byFileType: byType.rows
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
