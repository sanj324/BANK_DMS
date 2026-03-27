const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");

const router = express.Router();

/* ===== APPROVE ===== */

router.post("/:id/approve", auth, async (req, res) => {
  try {
    if (req.user.role !== "CHECKER") {
      return res.status(403).json({ message: "Only Checker allowed" });
    }

    await pool.query(
      "UPDATE documents SET status='APPROVED' WHERE id=$1",
      [req.params.id]
    );

    await auditLogger({
      userId: req.user.id,
      action: "APPROVE_DOCUMENT",
      entity: "DOCUMENT",
      entityId: req.params.id
    });

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Approval failed" });
  }
});

/* ===== REJECT ===== */

router.post("/:id/reject", auth, async (req, res) => {
  try {
    if (req.user.role !== "CHECKER") {
      return res.status(403).json({ message: "Only Checker allowed" });
    }

    await pool.query(
      "UPDATE documents SET status='REJECTED' WHERE id=$1",
      [req.params.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Reject failed" });
  }
});

module.exports = router;
