const express = require("express");
const multer = require("multer");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

/* ================= MULTER CONFIG ================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files allowed"), false);
    }
    cb(null, true);
  }
});

/* ================= UPLOAD DOCUMENT ================= */

router.post(
  "/",
  auth,
  upload.single("document"),
  async (req, res) => {
    try {
      if (req.user.role !== "MAKER") {
        return res.status(403).json({
          message: "Only Maker can upload"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "PDF file is required"
        });
      }

      const { name, folderId } = req.body;

      if (!name) {
        return res.status(400).json({
          message: "Document name required"
        });
      }

      const result = await pool.query(
        `
        INSERT INTO documents
        (name, file_path, folder_id, uploaded_by, status, created_at)
        VALUES ($1, $2, $3, $4, 'PENDING', NOW())
        RETURNING *
        `,
        [
          name,
          req.file.path,
          folderId || null,
          req.user.id
        ]
      );

      res.json({
        success: true,
        document: result.rows[0]
      });

    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= LIST DOCUMENTS ================= */

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM documents
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("LIST ERROR:", err);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
});

module.exports = router;