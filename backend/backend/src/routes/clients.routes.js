const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const auditLog = require("../middleware/auditLogger");
const { validateTenantUserCreate } = require("../middleware/validate");
const { encryptText, decryptText } = require("../utils/crypto");

const router = express.Router();

function isSuperAdmin(role) {
  return ["super_admin", "SUPER_ADMIN", "admin", "ADMIN", "checker", "CHECKER"].includes(role);
}

function requireSuperAdmin(req, res) {
  if (!isSuperAdmin(req.user.role)) {
    res.status(403).json({ message: "SaaS super-admin access required" });
    return false;
  }
  return true;
}

function isClientAdmin(role) {
  return ["client_admin", "CLIENT_ADMIN", "super_admin", "SUPER_ADMIN", "admin", "ADMIN"].includes(role);
}

function sanitizeUid(input) {
  return String(input || "").trim().replace(/[^\w-]/g, "_");
}

function sanitizeFolderSegment(input) {
  return String(input || "").trim().replace(/[^\w\s.-]/g, "_");
}

function normalizeExtensions(list) {
  const allowed = ["pdf", "docx", "xlsx", "png", "jpg", "jpeg"];
  const src = Array.isArray(list) ? list : [];
  const normalized = src
    .map((x) => String(x || "").toLowerCase().replace(".", "").trim())
    .filter((x) => allowed.includes(x));
  return normalized.length ? Array.from(new Set(normalized)) : ["pdf", "docx", "xlsx", "png", "jpg", "jpeg"];
}

function normalizeTenantUserRole(role) {
  const normalized = String(role || "maker").toLowerCase();
  const allowed = new Set(["maker", "checker", "viewer", "user"]);
  return allowed.has(normalized) ? normalized : null;
}

const logoDir = path.join(__dirname, "../../uploads/client-branding");
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: logoDir,
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^\w.-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!["image/png", "image/jpeg", "image/jpg", "image/svg+xml"].includes(file.mimetype)) {
      return cb(new Error("Only PNG/JPG/SVG logos are allowed"), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

async function getTenantPanelData(clientId) {
  const [clientResult, defaultUser, folders, usage, logs] = await Promise.all([
    pool.query(
      `
      SELECT client_id, client_uid, client_name, industry, status, subscription_start, subscription_expiry,
             primary_color, secondary_color, storage_quota_mb, allowed_file_types, default_root_folder, default_folders, logo_url
      FROM clients
      WHERE client_id = $1
      `,
      [clientId]
    ),
    pool.query(
      `
      SELECT id, user_id, username, email, role, is_active, must_reset_password, activated_at
      FROM users
      WHERE client_id = $1 AND LOWER(role) = 'client_admin'
      ORDER BY id ASC
      LIMIT 1
      `,
      [clientId]
    ),
    pool.query(
      `
      SELECT id, folder_id, name, folder_path, quota_mb, created_at
      FROM folders
      WHERE client_id = $1
      ORDER BY created_at ASC
      `,
      [clientId]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(file_size_mb),0)::int AS used_mb, COUNT(*)::int AS total_files
      FROM files
      WHERE client_id = $1
      `,
      [clientId]
    ),
    pool.query(
      `
      SELECT id, user_id, action, entity, details, timestamp
      FROM audit_logs
      WHERE entity = 'CLIENT' AND entity_id = $1
      ORDER BY timestamp DESC
      LIMIT 50
      `,
      [clientId]
    )
  ]);

  return {
    client: clientResult.rows[0] || null,
    default_user: defaultUser.rows[0] || null,
    folders: folders.rows,
    usage: usage.rows[0],
    logs: logs.rows
  };
}

router.get("/summary", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const result = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_clients,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_clients,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive_clients,
        COUNT(*) FILTER (
          WHERE status = 'active' AND subscription_expiry <= CURRENT_DATE + INTERVAL '30 day'
        )::int AS expiring_in_30_days
      FROM clients
      `
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const { status, industry, expiryWithinDays, q } = req.query;
    const params = [];
    const where = [];

    if (status) {
      params.push(String(status));
      where.push(`c.status = $${params.length}`);
    }
    if (industry) {
      params.push(String(industry));
      where.push(`c.industry = $${params.length}`);
    }
    if (expiryWithinDays) {
      params.push(Number(expiryWithinDays));
      where.push(`c.subscription_expiry <= CURRENT_DATE + ($${params.length} * INTERVAL '1 day')`);
    }
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      where.push(`(LOWER(c.client_name) LIKE $${params.length} OR LOWER(c.client_uid) LIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT
        c.client_id,
        c.client_uid,
        c.client_name,
        c.industry,
        c.subscription_start,
        c.subscription_expiry,
        c.status,
        c.logo_url,
        c.primary_color,
        c.secondary_color,
        c.storage_quota_mb,
        c.allowed_file_types,
        c.default_root_folder,
        c.default_folders,
        c.created_at,
        c.updated_at,
        COALESCE(u.username, '-') AS default_username,
        COALESCE(u.role, '-') AS default_role,
        c.contact_name,
        c.contact_email_encrypted,
        c.contact_phone_encrypted
      FROM clients c
      LEFT JOIN users u ON u.client_id = c.client_id AND u.role IN ('client_admin', 'CLIENT_ADMIN', 'viewer', 'VIEWER')
      ${whereSql}
      ORDER BY c.created_at DESC
      `,
      params
    );

    const rows = result.rows.map((r) => ({
      ...r,
      contact_email: decryptText(r.contact_email_encrypted),
      contact_phone: decryptText(r.contact_phone_encrypted)
    }));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const client = await pool.connect();
  try {
    const {
      client_uid,
      client_name,
      contact_name,
      contact_email,
      contact_phone,
      industry,
      subscription_start,
      subscription_expiry,
      primary_color = "#0f2a44",
      secondary_color = "#2b7cd3",
      storage_quota_mb = 1024,
      allowed_file_types = ["pdf", "docx", "xlsx", "png", "jpg", "jpeg"],
      default_root_folder = "Documents",
      default_folders = ["Compliance", "Legal", "HR"],
      default_user
    } = req.body || {};

    if (!client_uid || !client_name || !subscription_start || !subscription_expiry || !default_user) {
      return res.status(400).json({ message: "client_uid, client_name, subscription dates and default_user are required" });
    }

    if (!default_user.username || !default_user.email || !default_user.password) {
      return res.status(400).json({ message: "default_user must include username, email and password" });
    }

    const uid = sanitizeUid(client_uid);
    const role = "client_admin";
    const hash = await bcrypt.hash(default_user.password, 10);
    const allowedTypes = normalizeExtensions(allowed_file_types);
    const folderTemplates = Array.isArray(default_folders) && default_folders.length
      ? default_folders.map((x) => String(x).trim()).filter(Boolean)
      : ["Compliance", "Legal", "HR"];

    await client.query("BEGIN");

    const createdClient = await client.query(
      `
      INSERT INTO clients (
        client_uid, client_name, contact_name, contact_email_encrypted, contact_phone_encrypted,
        industry, subscription_start, subscription_expiry, status, primary_color, secondary_color
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10)
      RETURNING *
      `,
      [
        uid,
        client_name,
        contact_name || null,
        encryptText(contact_email || null),
        encryptText(contact_phone || null),
        industry || null,
        subscription_start,
        subscription_expiry,
        primary_color,
        secondary_color
      ]
    );

    const clientId = createdClient.rows[0].client_id;

    await client.query(
      `
      UPDATE clients
      SET storage_quota_mb = $1,
          allowed_file_types = $2,
          default_root_folder = $3,
          default_folders = $4,
          updated_at = NOW()
      WHERE client_id = $5
      `,
      [Number(storage_quota_mb) || 1024, allowedTypes, default_root_folder, JSON.stringify(folderTemplates), clientId]
    );

    const createdUser = await client.query(
      `
      INSERT INTO users (username, email, password, role, user_id, client_id, is_active, must_reset_password, activated_at)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(user_id) + 1 FROM users), 1), $5, TRUE, TRUE, NOW())
      RETURNING id, user_id, username, email, role, is_active, must_reset_password
      `,
      [default_user.username, default_user.email, hash, role, clientId]
    );

    const rootFolder = await client.query(
      `
      INSERT INTO folders (name, parent_id, created_by, user_id, folder_id, folder_path, quota_mb, client_id)
      VALUES ($1, NULL, $2, $3, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), $4, $5, $6)
      RETURNING id
      `,
      [
        default_root_folder,
        createdUser.rows[0].id,
        createdUser.rows[0].user_id,
        `/clients/${uid}/${default_root_folder}`,
        Number(storage_quota_mb) || 1024,
        clientId
      ]
    );

    for (const name of folderTemplates) {
      await client.query(
        `
        INSERT INTO folders (name, parent_id, created_by, user_id, folder_id, folder_path, quota_mb, client_id)
        VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), $5, $6, $7)
        `,
        [
          name,
          rootFolder.rows[0].id,
          createdUser.rows[0].id,
          createdUser.rows[0].user_id,
          `/clients/${uid}/${default_root_folder}/${name}`,
          Number(storage_quota_mb) || 1024,
          clientId
        ]
      );
    }

    await client.query("COMMIT");

    await auditLog({
      userId: req.user.id,
      action: "CREATE_CLIENT",
      entity: "CLIENT",
      entityId: clientId,
      details: `Created client ${client_name} (${uid}) with default user ${default_user.username}`
    });

    return res.status(201).json({
      client: {
        ...createdClient.rows[0],
        contact_email,
        contact_phone
      },
      default_user: createdUser.rows[0]
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

router.patch("/:clientId/settings", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const storageQuota = Number(req.body?.storage_quota_mb || 1024);
    const allowed = normalizeExtensions(req.body?.allowed_file_types || []);
    const defaultRoot = String(req.body?.default_root_folder || "Documents");
    const defaultFolders = Array.isArray(req.body?.default_folders)
      ? req.body.default_folders.map((x) => String(x).trim()).filter(Boolean)
      : ["Compliance", "Legal", "HR"];

    const updated = await pool.query(
      `
      UPDATE clients
      SET storage_quota_mb = $1,
          allowed_file_types = $2,
          default_root_folder = $3,
          default_folders = $4,
          updated_at = NOW()
      WHERE client_id = $5
      RETURNING *
      `,
      [storageQuota, allowed, defaultRoot, JSON.stringify(defaultFolders), id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "Client not found" });

    await pool.query("UPDATE folders SET quota_mb = $1 WHERE client_id = $2", [storageQuota, id]);

    await auditLog({
      userId: req.user.id,
      action: "UPDATE_CLIENT_SETTINGS",
      entity: "CLIENT",
      entityId: id,
      details: `Updated quota/filetypes/folders for client ${id}`
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/:clientId/tenant-panel", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const [clientResult, defaultUser, folders, usage, logs] = await Promise.all([
      pool.query(
        `
        SELECT client_id, client_uid, client_name, industry, status, subscription_start, subscription_expiry,
               primary_color, secondary_color, storage_quota_mb, allowed_file_types, default_root_folder, default_folders
        FROM clients
        WHERE client_id = $1
        `,
        [id]
      ),
      pool.query(
        `
        SELECT id, user_id, username, email, role, is_active, must_reset_password, activated_at
        FROM users
        WHERE client_id = $1 AND LOWER(role) = 'client_admin'
        ORDER BY id ASC
        LIMIT 1
        `,
        [id]
      ),
      pool.query(
        `
        SELECT id, folder_id, name, folder_path, quota_mb, created_at
        FROM folders
        WHERE client_id = $1
        ORDER BY created_at ASC
        `,
        [id]
      ),
      pool.query(
        `
        SELECT COALESCE(SUM(file_size_mb),0)::int AS used_mb, COUNT(*)::int AS total_files
        FROM files
        WHERE client_id = $1
        `,
        [id]
      ),
      pool.query(
        `
        SELECT id, user_id, action, entity, details, timestamp
        FROM audit_logs
        WHERE entity = 'CLIENT' AND entity_id = $1
        ORDER BY timestamp DESC
        LIMIT 50
        `,
        [id]
      )
    ]);

    if (!clientResult.rows.length) return res.status(404).json({ message: "Client not found" });

    return res.json({
      client: clientResult.rows[0],
      default_user: defaultUser.rows[0] || null,
      folders: folders.rows,
      usage: usage.rows[0],
      logs: logs.rows
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/tenant/me", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }
    const panel = await getTenantPanelData(req.user.client_id);
    if (!panel.client) return res.status(404).json({ message: "Tenant not found" });
    return res.json(panel);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/tenant/me/branding", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }
    const { primary_color, secondary_color } = req.body || {};
    const updated = await pool.query(
      `
      UPDATE clients
      SET primary_color = COALESCE($1, primary_color),
          secondary_color = COALESCE($2, secondary_color),
          updated_at = NOW()
      WHERE client_id = $3
      RETURNING client_id, primary_color, secondary_color, logo_url
      `,
      [primary_color || null, secondary_color || null, req.user.client_id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "Tenant not found" });
    await auditLog({
      userId: req.user.id,
      action: "UPDATE_TENANT_BRANDING",
      entity: "CLIENT",
      entityId: req.user.client_id,
      details: "Tenant branding updated by client admin"
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/tenant/me/logo", auth, (req, res) => {
  if (!req.user.client_id || !isClientAdmin(req.user.role)) {
    return res.status(403).json({ message: "Tenant admin access required" });
  }
  upload.single("logo")(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: "Logo file is required" });
    try {
      const logoUrl = `uploads/client-branding/${req.file.filename}`;
      const updated = await pool.query(
        "UPDATE clients SET logo_url = $1, updated_at = NOW() WHERE client_id = $2 RETURNING client_id, logo_url",
        [logoUrl, req.user.client_id]
      );
      await auditLog({
        userId: req.user.id,
        action: "UPLOAD_TENANT_LOGO",
        entity: "CLIENT",
        entityId: req.user.client_id,
        details: "Tenant logo updated by client admin"
      });
      return res.json(updated.rows[0]);
    } catch (uploadErr) {
      return res.status(500).json({ message: uploadErr.message });
    }
  });
});

router.get("/tenant/me/users", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.user_id,
        u.username,
        u.email,
        u.role,
        u.is_active,
        u.must_reset_password,
        u.created_at,
        COALESCE(SUM(f.quota_mb), 0)::int AS total_quota_mb
      FROM users u
      LEFT JOIN folders f ON f.client_id = u.client_id AND f.user_id = u.user_id
      WHERE u.client_id = $1
      GROUP BY u.id, u.user_id, u.username, u.email, u.role, u.is_active, u.must_reset_password, u.created_at
      ORDER BY created_at DESC
      `,
      [req.user.client_id]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/tenant/me/users", auth, validateTenantUserCreate, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }

    const { username, email, password, role = "maker" } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email and password are required" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: "password must be at least 8 characters" });
    }
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(String(username))) {
      return res.status(400).json({
        message: "username must be 3-40 chars and only contain letters, digits, dot, underscore, hyphen"
      });
    }

    const normalizedRole = normalizeTenantUserRole(role);
    if (!normalizedRole) {
      return res.status(400).json({ message: "role must be maker, checker, viewer, or user" });
    }

    await dbClient.query("BEGIN");

    const exists = await dbClient.query("SELECT id FROM users WHERE username = $1", [username]);
    if (exists.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({ message: "username already exists" });
    }

    const existsEmail = await dbClient.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existsEmail.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({ message: "email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const createdUser = await dbClient.query(
      `
      INSERT INTO users (username, email, password, role, user_id, client_id, is_active, must_reset_password, activated_at)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(user_id) + 1 FROM users), 1), $5, TRUE, TRUE, NOW())
      RETURNING id, user_id, username, email, role, is_active, must_reset_password, created_at
      `,
      [username, email, hash, normalizedRole, req.user.client_id]
    );

    const tenantMeta = await dbClient.query(
      "SELECT client_uid, default_root_folder, storage_quota_mb FROM clients WHERE client_id = $1",
      [req.user.client_id]
    );
    const clientUid = tenantMeta.rows[0]?.client_uid || `tenant_${req.user.client_id}`;
    const defaultRoot = tenantMeta.rows[0]?.default_root_folder || "Documents";
    const quotaMb = Number(tenantMeta.rows[0]?.storage_quota_mb || 1024);

    const tenantRoot = await dbClient.query(
      `
      SELECT id, folder_path
      FROM folders
      WHERE client_id = $1 AND parent_id IS NULL
      ORDER BY id ASC
      LIMIT 1
      `,
      [req.user.client_id]
    );

    const rootFolderPath = tenantRoot.rows[0]?.folder_path || `/clients/${clientUid}/${defaultRoot}`;
    const parentId = tenantRoot.rows[0]?.id || null;
    const userFolderPath = `${rootFolderPath}/users/${sanitizeUid(username)}`;

    await dbClient.query(
      `
      INSERT INTO folders (name, parent_id, created_by, user_id, folder_id, folder_path, quota_mb, client_id)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), $5, $6, $7)
      `,
      [sanitizeUid(username), parentId, req.user.id, createdUser.rows[0].user_id, userFolderPath, quotaMb, req.user.client_id]
    );

    await dbClient.query("COMMIT");

    await auditLog({
      userId: req.user.id,
      action: "TENANT_CREATE_USER",
      entity: "USER",
      entityId: createdUser.rows[0].id,
      details: `Tenant admin created user ${username}`
    });

    return res.status(201).json(createdUser.rows[0]);
  } catch (err) {
    await dbClient.query("ROLLBACK");
    return res.status(500).json({ message: err.message });
  } finally {
    dbClient.release();
  }
});

router.patch("/tenant/me/users/:id/activation", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }

    const userId = Number(req.params.id);
    const active = Boolean(req.body?.active);
    const updated = await pool.query(
      `
      UPDATE users
      SET is_active = $1,
          activated_at = CASE WHEN $1 THEN NOW() ELSE activated_at END
      WHERE id = $2 AND client_id = $3
      RETURNING id, user_id, username, email, role, is_active, must_reset_password
      `,
      [active, userId, req.user.client_id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "User not found in tenant" });

    await auditLog({
      userId: req.user.id,
      action: active ? "TENANT_ACTIVATE_USER" : "TENANT_DEACTIVATE_USER",
      entity: "USER",
      entityId: userId,
      details: `Tenant admin set user active=${active}`
    });

    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/tenant/me/users/:id/profile", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }

    const userId = Number(req.params.id);
    const { email, role } = req.body || {};
    const normalizedRole = role ? normalizeTenantUserRole(role) : null;
    if (role && !normalizedRole) {
      return res.status(400).json({ message: "role must be maker, checker, viewer, or user" });
    }

    const updated = await pool.query(
      `
      UPDATE users
      SET email = COALESCE($1, email),
          role = COALESCE($2, role)
      WHERE id = $3 AND client_id = $4
      RETURNING id, user_id, username, email, role, is_active, must_reset_password
      `,
      [email || null, normalizedRole || null, userId, req.user.client_id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "User not found in tenant" });

    await auditLog({
      userId: req.user.id,
      action: "TENANT_UPDATE_USER_PROFILE",
      entity: "USER",
      entityId: userId,
      details: "Tenant admin updated user profile"
    });

    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/tenant/me/users/:id/quota", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }

    const userId = Number(req.params.id);
    const quotaMb = Number(req.body?.quota_mb);
    if (!Number.isFinite(quotaMb) || quotaMb <= 0) {
      return res.status(400).json({ message: "quota_mb must be a positive number" });
    }

    const user = await pool.query(
      "SELECT id, user_id, username FROM users WHERE id = $1 AND client_id = $2",
      [userId, req.user.client_id]
    );
    if (!user.rows.length) return res.status(404).json({ message: "User not found in tenant" });

    const updateResult = await pool.query(
      `
      UPDATE folders
      SET quota_mb = $1
      WHERE client_id = $2 AND user_id = $3
      RETURNING id
      `,
      [quotaMb, req.user.client_id, user.rows[0].user_id]
    );

    await auditLog({
      userId: req.user.id,
      action: "TENANT_UPDATE_USER_QUOTA",
      entity: "USER",
      entityId: userId,
      details: `Tenant admin set quota to ${quotaMb} MB for ${user.rows[0].username} (${updateResult.rowCount} folders)`
    });

    return res.json({
      success: true,
      quota_mb: quotaMb,
      affected_folders: updateResult.rowCount
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/tenant/me/folders", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }
    const folders = await pool.query(
      `
      SELECT id, folder_id, name, parent_id, folder_path, quota_mb, created_by, created_at
      FROM folders
      WHERE client_id = $1
      ORDER BY created_at ASC
      `,
      [req.user.client_id]
    );
    return res.json(folders.rows);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/tenant/me/folders", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }

    const nameRaw = sanitizeFolderSegment(req.body?.name);
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    if (!nameRaw) {
      return res.status(400).json({ message: "Folder name required" });
    }

    const tenantMeta = await pool.query(
      "SELECT client_uid, default_root_folder, storage_quota_mb FROM clients WHERE client_id = $1",
      [req.user.client_id]
    );
    const clientUid = tenantMeta.rows[0]?.client_uid || `tenant_${req.user.client_id}`;
    const defaultRoot = tenantMeta.rows[0]?.default_root_folder || "Documents";
    const quotaMb = Number(tenantMeta.rows[0]?.storage_quota_mb || 1024);

    let parentFolder = null;
    if (parentId) {
      const parent = await pool.query(
        "SELECT id, folder_path FROM folders WHERE id = $1 AND client_id = $2",
        [parentId, req.user.client_id]
      );
      if (!parent.rows.length) return res.status(404).json({ message: "Parent folder not found in tenant" });
      parentFolder = parent.rows[0];
    }

    const basePath = parentFolder?.folder_path || `/clients/${clientUid}/${defaultRoot}`;
    const folderPath = `${basePath}/${nameRaw}`;
    const created = await pool.query(
      `
      INSERT INTO folders (name, parent_id, created_by, user_id, folder_id, folder_path, quota_mb, client_id)
      VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), $5, $6, $7)
      RETURNING id, folder_id, name, parent_id, folder_path, quota_mb, client_id, created_at
      `,
      [nameRaw, parentFolder?.id || null, req.user.id, req.user.id, folderPath, quotaMb, req.user.client_id]
    );

    await auditLog({
      userId: req.user.id,
      action: "TENANT_CREATE_FOLDER",
      entity: "FOLDER",
      entityId: created.rows[0].id,
      details: `Tenant admin created folder ${folderPath}`
    });

    return res.status(201).json(created.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/my-tenant", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }
    const panel = await getTenantPanelData(req.user.client_id);
    if (!panel.client) return res.status(404).json({ message: "Tenant not found" });
    return res.json(panel);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/my-tenant/branding", auth, async (req, res) => {
  try {
    if (!req.user.client_id || !isClientAdmin(req.user.role)) {
      return res.status(403).json({ message: "Tenant admin access required" });
    }
    const { primary_color, secondary_color } = req.body || {};
    const updated = await pool.query(
      `
      UPDATE clients
      SET primary_color = COALESCE($1, primary_color),
          secondary_color = COALESCE($2, secondary_color),
          updated_at = NOW()
      WHERE client_id = $3
      RETURNING client_id, primary_color, secondary_color, logo_url
      `,
      [primary_color || null, secondary_color || null, req.user.client_id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "Tenant not found" });
    await auditLog({
      userId: req.user.id,
      action: "UPDATE_TENANT_BRANDING",
      entity: "CLIENT",
      entityId: req.user.client_id,
      details: "Tenant branding updated by client admin"
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/my-tenant/logo", auth, (req, res) => {
  if (!req.user.client_id || !isClientAdmin(req.user.role)) {
    return res.status(403).json({ message: "Tenant admin access required" });
  }
  upload.single("logo")(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: "Logo file is required" });
    try {
      const logoUrl = `uploads/client-branding/${req.file.filename}`;
      const updated = await pool.query(
        "UPDATE clients SET logo_url = $1, updated_at = NOW() WHERE client_id = $2 RETURNING client_id, logo_url",
        [logoUrl, req.user.client_id]
      );
      await auditLog({
        userId: req.user.id,
        action: "UPLOAD_TENANT_LOGO",
        entity: "CLIENT",
        entityId: req.user.client_id,
        details: "Tenant logo updated by client admin"
      });
      return res.json(updated.rows[0]);
    } catch (uploadErr) {
      return res.status(500).json({ message: uploadErr.message });
    }
  });
});

router.put("/:clientId", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const {
      client_name,
      contact_name,
      contact_email,
      contact_phone,
      industry,
      subscription_start,
      subscription_expiry,
      status,
      primary_color,
      secondary_color
    } = req.body || {};

    const updated = await pool.query(
      `
      UPDATE clients
      SET
        client_name = COALESCE($1, client_name),
        contact_name = COALESCE($2, contact_name),
        contact_email_encrypted = COALESCE($3, contact_email_encrypted),
        contact_phone_encrypted = COALESCE($4, contact_phone_encrypted),
        industry = COALESCE($5, industry),
        subscription_start = COALESCE($6, subscription_start),
        subscription_expiry = COALESCE($7, subscription_expiry),
        status = COALESCE($8, status),
        primary_color = COALESCE($9, primary_color),
        secondary_color = COALESCE($10, secondary_color),
        updated_at = NOW()
      WHERE client_id = $11
      RETURNING *
      `,
      [
        client_name || null,
        contact_name || null,
        contact_email ? encryptText(contact_email) : null,
        contact_phone ? encryptText(contact_phone) : null,
        industry || null,
        subscription_start || null,
        subscription_expiry || null,
        status || null,
        primary_color || null,
        secondary_color || null,
        id
      ]
    );

    if (!updated.rows.length) return res.status(404).json({ message: "Client not found" });

    await auditLog({
      userId: req.user.id,
      action: "UPDATE_CLIENT",
      entity: "CLIENT",
      entityId: id,
      details: `Updated client ${updated.rows[0].client_uid}`
    });

    return res.json({
      ...updated.rows[0],
      contact_email: decryptText(updated.rows[0].contact_email_encrypted),
      contact_phone: decryptText(updated.rows[0].contact_phone_encrypted)
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.delete("/:clientId", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    await pool.query("DELETE FROM clients WHERE client_id = $1", [id]);
    await auditLog({
      userId: req.user.id,
      action: "DELETE_CLIENT",
      entity: "CLIENT",
      entityId: id,
      details: `Deleted client id ${id}`
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/:clientId/logo", auth, (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  upload.single("logo")(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: "Logo file is required" });

    try {
      const id = Number(req.params.clientId);
      const logoUrl = `uploads/client-branding/${req.file.filename}`;
      const updated = await pool.query(
        "UPDATE clients SET logo_url = $1, updated_at = NOW() WHERE client_id = $2 RETURNING client_id, logo_url",
        [logoUrl, id]
      );
      if (!updated.rows.length) return res.status(404).json({ message: "Client not found" });

      await auditLog({
        userId: req.user.id,
        action: "UPLOAD_CLIENT_LOGO",
        entity: "CLIENT",
        entityId: id,
        details: `Uploaded logo for client ${id}`
      });
      return res.json(updated.rows[0]);
    } catch (uploadErr) {
      return res.status(500).json({ message: uploadErr.message });
    }
  });
});

router.post("/:clientId/renew", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const extraDays = Number(req.body?.extraDays || 30);
    const renewed = await pool.query(
      `
      UPDATE clients
      SET subscription_expiry = subscription_expiry + ($1 * INTERVAL '1 day'),
          status = 'active',
          updated_at = NOW()
      WHERE client_id = $2
      RETURNING *
      `,
      [extraDays, id]
    );
    if (!renewed.rows.length) return res.status(404).json({ message: "Client not found" });
    await auditLog({
      userId: req.user.id,
      action: "RENEW_CLIENT",
      entity: "CLIENT",
      entityId: id,
      details: `Renewed client ${id} by ${extraDays} days`
    });
    return res.json(renewed.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/:clientId/terminate", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const terminated = await pool.query(
      `
      UPDATE clients
      SET status = 'inactive', terminated_at = NOW(), updated_at = NOW()
      WHERE client_id = $1
      RETURNING *
      `,
      [id]
    );
    if (!terminated.rows.length) return res.status(404).json({ message: "Client not found" });

    await pool.query("UPDATE users SET is_active = FALSE WHERE client_id = $1", [id]);
    await auditLog({
      userId: req.user.id,
      action: "TERMINATE_CLIENT",
      entity: "CLIENT",
      entityId: id,
      details: `Terminated client ${id}`
    });
    return res.json(terminated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/:clientId/default-user/reset-password", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: "newPassword (min 8 chars) is required" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const updated = await pool.query(
      `
      UPDATE users
      SET password = $1, must_reset_password = TRUE
      WHERE id = (
        SELECT id FROM users
        WHERE client_id = $2 AND role IN ('client_admin','CLIENT_ADMIN','viewer','VIEWER')
        ORDER BY id ASC LIMIT 1
      )
      RETURNING id, username, email, role, must_reset_password
      `,
      [hash, id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "Default user not found" });

    await auditLog({
      userId: req.user.id,
      action: "RESET_CLIENT_USER_PASSWORD",
      entity: "USER",
      entityId: updated.rows[0].id,
      details: `Password reset for ${updated.rows[0].username} (client ${id})`
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/:clientId/default-user/activation", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.clientId);
    const active = Boolean(req.body?.active);
    const updated = await pool.query(
      `
      UPDATE users
      SET is_active = $1,
          activated_at = CASE WHEN $1 THEN NOW() ELSE activated_at END
      WHERE id = (
        SELECT id FROM users
        WHERE client_id = $2 AND role IN ('client_admin','CLIENT_ADMIN','viewer','VIEWER')
        ORDER BY id ASC LIMIT 1
      )
      RETURNING id, username, is_active, activated_at
      `,
      [active, id]
    );
    if (!updated.rows.length) return res.status(404).json({ message: "Default user not found" });

    await auditLog({
      userId: req.user.id,
      action: active ? "ACTIVATE_CLIENT_USER" : "DEACTIVATE_CLIENT_USER",
      entity: "USER",
      entityId: updated.rows[0].id,
      details: `Set active=${active} for client ${id} default user`
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/alerts/expiring", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const days = Number(req.query.days || 30);
    const result = await pool.query(
      `
      SELECT client_id, client_uid, client_name, subscription_expiry, status
      FROM clients
      WHERE status = 'active'
        AND subscription_expiry <= CURRENT_DATE + ($1 * INTERVAL '1 day')
      ORDER BY subscription_expiry ASC
      `,
      [days]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/export", auth, async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const rows = await pool.query(
      `
      SELECT client_uid, client_name, industry, status, subscription_start, subscription_expiry, created_at
      FROM clients
      ORDER BY created_at DESC
      `
    );
    const header = [
      "client_uid",
      "client_name",
      "industry",
      "status",
      "subscription_start",
      "subscription_expiry",
      "created_at"
    ];
    const csv = [
      header.join(","),
      ...rows.rows.map((r) =>
        [
          r.client_uid,
          r.client_name,
          r.industry || "",
          r.status,
          r.subscription_start,
          r.subscription_expiry,
          r.created_at
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="clients_report.csv"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
