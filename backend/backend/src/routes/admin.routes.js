const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const auditLog = require("../middleware/auditLogger");
const { ADMIN_ROLES } = require("../config/policies");
const { provisionUserFolder } = require("../utils/userProvisioning");

const router = express.Router();

function requireAdmin(req, res) {
  if (!ADMIN_ROLES.has(req.user.role)) {
    res.status(403).json({ message: "Admin access required" });
    return false;
  }
  return true;
}

router.get("/overview", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const [users, files, usage] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total_users FROM users"),
      pool.query("SELECT COUNT(*)::int AS total_files FROM files"),
      pool.query(
        `
        SELECT
          f.folder_id,
          f.folder_path,
          f.quota_mb,
          COALESCE(SUM(fl.file_size_mb), 0)::int AS used_mb
        FROM folders f
        LEFT JOIN files fl ON fl.folder_id = f.folder_id
        GROUP BY f.folder_id, f.folder_path, f.quota_mb
        ORDER BY f.folder_id
        `
      )
    ]);

    return res.json({
      totalUsers: users.rows[0].total_users,
      totalFiles: files.rows[0].total_files,
      folderUsage: usage.rows
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/users", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const result = await pool.query(
      `
      SELECT id, user_id, username, email, role, created_at
      FROM users
      ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/users", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  let client;
  try {
    const { username, email, password, role = "user" } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email and password are required" });
    }

    const hash = await bcrypt.hash(password, 10);
    client = await pool.connect();
    await client.query("BEGIN");

    const created = await client.query(
      `
      INSERT INTO users (username, email, password, role, user_id)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(user_id) + 1 FROM users), 1))
      RETURNING id, user_id, username, email, role, created_at
      `,
      [username, email, hash, role]
    );

    const folder = await provisionUserFolder(client, created.rows[0], req.user.id);
    await client.query("COMMIT");
    client.release();
    client = null;

    await auditLog({
      userId: req.user.id,
      action: "CREATE_USER",
      entity: "USER",
      entityId: created.rows[0].id,
      details: `Created user ${username} and allocated folder ${folder.folder_path}`
    });

    res.status(201).json({ ...created.rows[0], folder });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    res.status(500).json({ message: err.message });
  }
});

router.put("/users/:id", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { email, role } = req.body || {};
    const updated = await pool.query(
      `
      UPDATE users
      SET email = COALESCE($1, email),
          role = COALESCE($2, role)
      WHERE id = $3
      RETURNING id, user_id, username, email, role, created_at
      `,
      [email || null, role || null, Number(req.params.id)]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "User not found" });

    await auditLog({
      userId: req.user.id,
      action: "UPDATE_USER",
      entity: "USER",
      entityId: updated.rows[0].id,
      details: `Updated user ${updated.rows[0].username}`
    });

    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/users/:id", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const existing = await pool.query("SELECT id, username FROM users WHERE id = $1", [
      Number(req.params.id)
    ]);
    if (!existing.rows.length) return res.status(404).json({ message: "User not found" });

    await pool.query("DELETE FROM users WHERE id = $1", [Number(req.params.id)]);

    await auditLog({
      userId: req.user.id,
      action: "DELETE_USER",
      entity: "USER",
      entityId: Number(req.params.id),
      details: `Deleted user ${existing.rows[0].username}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/folders/:folderId/quota", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const quotaMb = Number(req.body?.quota_mb);
    if (!Number.isFinite(quotaMb) || quotaMb <= 0) {
      return res.status(400).json({ message: "quota_mb must be a positive number" });
    }

    const updated = await pool.query(
      `
      UPDATE folders
      SET quota_mb = $1
      WHERE folder_id = $2
      RETURNING id, folder_id, folder_path, quota_mb, user_id
      `,
      [quotaMb, Number(req.params.folderId)]
    );

    if (!updated.rows.length) return res.status(404).json({ message: "Folder not found" });

    await auditLog({
      userId: req.user.id,
      action: "UPDATE_QUOTA",
      entity: "FOLDER",
      entityId: updated.rows[0].id,
      details: `Quota changed to ${quotaMb} MB for folder ${updated.rows[0].folder_path}`
    });

    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/logs", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { userId, action, from, to } = req.query;
    const filters = [];
    const params = [];

    if (userId) {
      params.push(Number(userId));
      filters.push(`a.user_id = $${params.length}`);
    }
    if (action) {
      params.push(String(action));
      filters.push(`a.action = $${params.length}`);
    }
    if (from) {
      params.push(String(from));
      filters.push(`a.timestamp >= $${params.length}::timestamp`);
    }
    if (to) {
      params.push(String(to));
      filters.push(`a.timestamp <= $${params.length}::timestamp`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.log_id,
        a.user_id,
        u.username,
        a.action,
        a.entity,
        a.entity_id,
        a.details,
        a.timestamp
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereClause}
      ORDER BY a.timestamp DESC
      LIMIT 1000
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
