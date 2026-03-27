const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

/* GET ALL FOLDERS */
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM folders ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("FOLDER ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* CREATE FOLDER */
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "MAKER") {
      return res.status(403).json({ message: "Only Maker can create folder" });
    }

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Folder name required" });
    }

    const result = await pool.query(
      "INSERT INTO folders (name, created_by) VALUES ($1, $2) RETURNING *",
      [name, req.user.id]
    );

    res.json({ success: true, folder: result.rows[0] });

  } catch (err) {
    console.error("FOLDER CREATE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
