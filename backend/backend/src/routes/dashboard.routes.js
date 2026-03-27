const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const { ADMIN_ROLES } = require("../config/policies");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    let query = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE d.status = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE d.status = 'REJECTED')::int AS rejected
      FROM documents d
      JOIN users u ON u.id = d.uploaded_by
    `;
    const params = [];

    if (req.user.client_id) {
      query += ` WHERE u.client_id = $1`;
      params.push(req.user.client_id);
    } else if (!ADMIN_ROLES.has(req.user.role)) {
      query += ` WHERE d.uploaded_by = $1`;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);

    const stats = result.rows[0];

    res.json({
      total: stats.total || 0,
      pending: stats.pending || 0,
      approved: stats.approved || 0,
      rejected: stats.rejected || 0
    });

  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Dashboard error" });
  }
});

module.exports = router;
