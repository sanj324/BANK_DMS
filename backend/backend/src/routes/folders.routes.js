const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const auditLog = require("../middleware/auditLogger");
const { ADMIN_ROLES } = require("../config/policies");

const router = express.Router();

/* GET ALL FOLDERS */
router.get("/", auth, async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.has(req.user.role);
    const hasTenant = Boolean(req.user.client_id);

    const result = hasTenant
      ? await pool.query(
          `
          SELECT * FROM folders
          WHERE client_id = $1
          ORDER BY created_at DESC
          `,
          [req.user.client_id]
        )
      : isAdmin
      ? await pool.query("SELECT * FROM folders ORDER BY created_at DESC")
      : await pool.query(
          `
          SELECT * FROM folders
          WHERE created_by = $1 OR created_by IS NULL
          ORDER BY created_at DESC
          `,
          [req.user.id]
        );

    await auditLog({
      userId: req.user.id,
      action: "FOLDER_ACCESS",
      entity: "FOLDER",
      entityId: null
    });

    res.json(result.rows);
  } catch (err) {
    console.error("FOLDER ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* CREATE FOLDER */
router.post("/", auth, async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.has(req.user.role);
    const hasTenant = Boolean(req.user.client_id);
    const normalizedRole = String(req.user.role || "").toLowerCase();
    if (normalizedRole === "checker" && !isAdmin) {
      return res.status(403).json({ message: "Only Maker or Admin can create folder" });
    }

    const { name, parentId = null } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Folder name required" });
    }

    let parentFolder = null;
    if (parentId) {
      const parent = await pool.query("SELECT id, created_by, client_id, folder_path FROM folders WHERE id = $1", [parentId]);
      if (!parent.rows.length) {
        return res.status(404).json({ message: "Parent folder not found" });
      }
      parentFolder = parent.rows[0];
      if (!isAdmin && hasTenant && Number(parent.rows[0].client_id || 0) !== Number(req.user.client_id || 0)) {
        return res.status(403).json({ message: "Parent folder is outside your tenant" });
      }
      if (!isAdmin && !hasTenant && parent.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ message: "No permission on parent folder" });
      }
    }

    const folderPath = parentFolder?.folder_path ? `${parentFolder.folder_path}/${name}` : null;
    const result = await pool.query(
      `
      INSERT INTO folders (name, parent_id, created_by, user_id, folder_id, folder_path, client_id)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), $5, $6)
      RETURNING *
      `,
      [name, parentId, req.user.id, req.user.id, folderPath, hasTenant ? req.user.client_id : null]
    );

    await auditLog({
      userId: req.user.id,
      action: "FOLDER_CREATE",
      entity: "FOLDER",
      entityId: result.rows[0].id
    });

    res.json({ success: true, folder: result.rows[0] });

  } catch (err) {
    console.error("FOLDER CREATE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/:folderId/files", auth, async (req, res) => {
  try {
    const folderId = Number(req.params.folderId);
    const isAdmin = ADMIN_ROLES.has(req.user.role);

    const folder = await pool.query(
      "SELECT id, folder_id, created_by, client_id, folder_path, quota_mb FROM folders WHERE folder_id = $1 OR id = $1 LIMIT 1",
      [folderId]
    );

    if (!folder.rows.length) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const selectedFolder = folder.rows[0];
    if (req.user.client_id && Number(selectedFolder.client_id || 0) !== Number(req.user.client_id || 0)) {
      return res.status(403).json({ message: "No permission to access this tenant folder" });
    }

    if (!isAdmin && !req.user.client_id && selectedFolder.created_by !== req.user.id) {
      return res.status(403).json({ message: "No permission to access this folder" });
    }

    const files = await pool.query(
      `
      SELECT file_id, folder_id, filename, file_size_mb, uploaded_at, checksum
      FROM files
      WHERE folder_id = $1
      ORDER BY uploaded_at DESC
      `,
      [selectedFolder.folder_id]
    );

    const usage = await pool.query(
      "SELECT COALESCE(SUM(file_size_mb), 0)::int AS used_mb FROM files WHERE folder_id = $1",
      [selectedFolder.folder_id]
    );

    res.json({
      folder: selectedFolder,
      used_mb: Number(usage.rows[0].used_mb || 0),
      files: files.rows
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
