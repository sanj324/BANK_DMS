const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM documents");
    const pending = await pool.query(
      "SELECT COUNT(*) FROM documents WHERE status='PENDING'"
    );
    const approved = await pool.query(
      "SELECT COUNT(*) FROM documents WHERE status='APPROVED'"
    );
    const rejected = await pool.query(
      "SELECT COUNT(*) FROM documents WHERE status='REJECTED'"
    );

    res.json({
      total: total.rows[0].count,
      pending: pending.rows[0].count,
      approved: approved.rows[0].count,
      rejected: rejected.rows[0].count
      
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
