const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const auditLog = require("../middleware/auditLogger");
const { provisionUserFolder } = require("../utils/userProvisioning");
const { createRateLimiter, getClientIp } = require("../middleware/rateLimit");
const { createLoginGuard } = require("../middleware/loginGuard");
const { validateLogin, validateSignup } = require("../middleware/validate");
const security = require("../config/security");

const router = express.Router();
const loginLimiter = createRateLimiter({
  windowMs: security.rateLimit.loginWindowMs,
  max: security.rateLimit.loginMax,
  keyGenerator: (req) => `${getClientIp(req)}|${String(req.body?.username || "").toLowerCase()}`,
  message: "Too many login attempts. Please try again later."
});
const loginGuard = createLoginGuard({
  windowMs: security.rateLimit.lockWindowMs,
  threshold: security.rateLimit.lockThreshold
});

function sanitizeUsername(value) {
  return String(value || "").trim();
}

function getAuditMeta(req) {
  return {
    ipAddress: getClientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    requestId: req.requestId || null
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function issueRefreshToken(userId, req) {
  const plain = crypto.randomBytes(48).toString("hex");
  const tokenHash = sha256(plain);
  const expiresAt = new Date(Date.now() + security.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [userId, tokenHash, expiresAt, getClientIp(req), String(req.headers["user-agent"] || "").slice(0, 500)]
  );
  return plain;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      client_id: user.client_id || null
    },
    process.env.JWT_SECRET,
    {
      expiresIn: security.jwt.accessTtl,
      algorithm: "HS256",
      issuer: security.jwt.issuer,
      audience: security.jwt.audience
    }
  );
}

router.post("/signup", validateSignup, async (req, res) => {
  const client = await pool.connect();
  try {
    const username = sanitizeUsername(req.body?.username);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

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

    const usernameExists = await client.query("SELECT id FROM users WHERE username = $1", [username]);
    if (usernameExists.rows.length) {
      return res.status(409).json({ message: "username already exists" });
    }

    const emailExists = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (emailExists.rows.length) {
      return res.status(409).json({ message: "email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    await client.query("BEGIN");

    const created = await client.query(
      `
      INSERT INTO users (username, email, password, role, user_id)
      VALUES ($1, $2, $3, 'user', COALESCE((SELECT MAX(user_id) + 1 FROM users), 1))
      RETURNING id, user_id, username, email, role, created_at
      `,
      [username, email, hash]
    );

    const folder = await provisionUserFolder(client, created.rows[0], created.rows[0].id);
    await client.query("COMMIT");

    await auditLog({
      userId: created.rows[0].id,
      action: "SIGNUP",
      entity: "USER",
      entityId: created.rows[0].id,
      details: `Self-signup and folder allocation at ${folder.folder_path}`,
      ...getAuditMeta(req)
    });

    return res.status(201).json({
      success: true,
      user: created.rows[0],
      folder
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

router.post("/login", validateLogin, loginLimiter, loginGuard.lockoutMiddleware, async (req, res) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const requestIp = getClientIp(req);

    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required" });
    }

    const lockState = loginGuard.isLocked(username, requestIp);
    if (lockState.locked) {
      res.setHeader("Retry-After", String(lockState.retryAfterSec));
      return res.status(429).json({ message: "Too many failed login attempts. Please try again later." });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username=$1",
      [username]
    );

    if (!result.rows.length) {
      loginGuard.recordFailure(username, requestIp);
      return res.status(401).json({ message: "Invalid user" });
    }

    const user = result.rows[0];
    if (user.is_active === false) {
      return res.status(403).json({ message: "Account is inactive. Contact your administrator." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      loginGuard.recordFailure(username, requestIp);
      return res.status(401).json({ message: "Invalid password" });
    }

    loginGuard.clearFailure(username, requestIp);

    const token = signAccessToken(user);

    await auditLog({
      userId: user.id,
      action: "LOGIN",
      entity: "USER",
      entityId: user.id,
      ...getAuditMeta(req)
    });

    let tenantBranding = null;
    if (user.client_id) {
      const clientResult = await pool.query(
        `
        SELECT client_id, client_uid, client_name, primary_color, secondary_color, logo_url, status
        FROM clients
        WHERE client_id = $1
        `,
        [user.client_id]
      );
      tenantBranding = clientResult.rows[0] || null;
    }

    const responsePayload = {
      token,
      role: user.role,
      userId: user.user_id || user.id,
      username: user.username,
      must_reset_password: Boolean(user.must_reset_password),
      client_id: user.client_id || null,
      tenant_branding: tenantBranding
    };

    if (security.jwt.enableRefresh) {
      responsePayload.refresh_token = await issueRefreshToken(user.id, req);
    }

    res.json(responsePayload);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    if (!security.jwt.enableRefresh) {
      return res.status(404).json({ message: "Refresh token flow is disabled" });
    }
    const refreshToken = String(req.body?.refresh_token || "").trim();
    if (!refreshToken) return res.status(400).json({ message: "refresh_token is required" });

    const tokenHash = sha256(refreshToken);
    const tokenRow = await pool.query(
      `
      SELECT id, user_id, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_hash = $1
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!tokenRow.rows.length) return res.status(401).json({ message: "Invalid refresh token" });
    const row = tokenRow.rows[0];
    if (row.revoked_at) return res.status(401).json({ message: "Refresh token revoked" });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ message: "Refresh token expired" });
    }

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [row.user_id]);
    if (!userResult.rows.length) return res.status(401).json({ message: "User not found" });
    const user = userResult.rows[0];
    if (user.is_active === false) return res.status(403).json({ message: "Account is inactive" });

    const newRefreshToken = await issueRefreshToken(user.id, req);
    await pool.query(
      `
      UPDATE refresh_tokens
      SET revoked_at = NOW(), replaced_by_hash = $1
      WHERE id = $2
      `,
      [sha256(newRefreshToken), row.id]
    );

    return res.json({
      token: signAccessToken(user),
      refresh_token: newRefreshToken
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/logout", async (req, res) => {
  try {
    if (!security.jwt.enableRefresh) {
      return res.json({ success: true });
    }
    const refreshToken = String(req.body?.refresh_token || "").trim();
    if (refreshToken) {
      await pool.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
        [sha256(refreshToken)]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
