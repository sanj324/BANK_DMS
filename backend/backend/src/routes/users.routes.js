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
    res.status(403).json({ message: "Only system administrators can create users" });
    return false;
  }
  return true;
}

router.post("/", auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { username, email, password, role = "user" } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ message: "username, email and password are required" });
  }

  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    return res.status(400).json({
      message: "username must be 3-40 chars and only contain letters, digits, dot, underscore, hyphen"
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: "password must be at least 8 characters" });
  }

  const normalizedRole = String(role).toLowerCase();
  if (!["user", "admin", "maker", "checker"].includes(normalizedRole)) {
    return res.status(400).json({ message: "role must be one of user, admin, maker, checker" });
  }

  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "username already exists" });
    }

    const existingEmail = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingEmail.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "email already exists" });
    }

    const userResult = await client.query(
      `
      INSERT INTO users (username, email, password, role, user_id)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(user_id) + 1 FROM users), 1))
      RETURNING id, user_id, username, email, role, created_at
      `,
      [username, email, hash, normalizedRole]
    );
    const createdUser = userResult.rows[0];

    const folder = await provisionUserFolder(client, createdUser, req.user.id);

    await client.query("COMMIT");

    await auditLog({
      userId: req.user.id,
      action: "CREATE_USER",
      entity: "USER",
      entityId: createdUser.id
    });
    await auditLog({
      userId: req.user.id,
      action: "ALLOCATE_FOLDER",
      entity: "FOLDER",
      entityId: folder.id
    });

    return res.status(201).json({
      success: true,
      user: createdUser,
      folder,
      storagePath: `/users/${username}`
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
