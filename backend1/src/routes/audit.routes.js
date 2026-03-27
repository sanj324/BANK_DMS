const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.username,
        a.action,
        a.entity,
        a.timestamp
      FROM audit_logs a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.timestamp DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("AUDIT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
