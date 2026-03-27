const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const path = require("path");
const fs = require("fs");
const { ADMIN_ROLES } = require("../config/policies");

const router = express.Router();
const projectRoot = path.join(__dirname, "../..");
const uploadDir = path.join(projectRoot, "uploads");

function validate(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function resolveStoredFilePath(filePath) {
  if (!filePath) return null;

  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.startsWith("uploads/")) {
    return path.join(projectRoot, normalized);
  }

  if (normalized.startsWith("users/")) {
    return path.join(uploadDir, normalized);
  }

  return path.join(uploadDir, path.basename(filePath));
}

async function fetchDocumentWithAccess(id) {
  return pool.query(
    `
    SELECT
      d.id,
      d.file_path,
      d.name,
      d.uploaded_by,
      d.folder_id,
      f.created_by AS folder_owner
    FROM documents d
    LEFT JOIN folders f ON f.id = d.folder_id
    WHERE d.id = $1
    `,
    [id]
  );
}

function buildDownloadName(doc) {
  const ext = path.extname(String(doc.file_path || "")).toLowerCase() || ".bin";
  if (String(doc.name || "").toLowerCase().endsWith(ext)) {
    return doc.name;
  }
  return `${doc.name}${ext}`;
}

function canAccessDocument(user, doc) {
  if (!user || !doc) return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  if (doc.uploaded_by === user.id) return true;
  if (doc.folder_owner && doc.folder_owner === user.id) return true;
  return false;
}

async function logDocumentAccess({ documentId, userId, action, req }) {
  await pool.query(
    `
    INSERT INTO document_access_logs (document_id, user_id, action, ip_address, user_agent, timestamp)
    VALUES ($1, $2, $3, $4, $5, NOW())
    `,
    [documentId, userId, action, req.ip || null, req.headers["user-agent"] || null]
  );
}

router.get("/view/:id", async (req, res) => {
  const user = validate(req.query.token);
  if (!user) return res.status(401).send("Invalid token");

  const result = await fetchDocumentWithAccess(req.params.id);

  if (!result.rows.length)
    return res.status(404).send("Not found");

  const doc = result.rows[0];
  if (!canAccessDocument(user, doc)) {
    return res.status(403).send("Forbidden");
  }

  const filePath = resolveStoredFilePath(doc.file_path);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send(`File not found: ${doc.file_path}`);
  }

  await logDocumentAccess({ documentId: doc.id, userId: user.id, action: "VIEW", req });
  res.sendFile(filePath);
});

router.get("/download/:id", async (req, res) => {
  const user = validate(req.query.token);
  if (!user) return res.status(401).send("Invalid token");

  const result = await fetchDocumentWithAccess(req.params.id);

  if (!result.rows.length)
    return res.status(404).send("Not found");

  const doc = result.rows[0];
  if (!canAccessDocument(user, doc)) {
    return res.status(403).send("Forbidden");
  }

  const filePath = resolveStoredFilePath(doc.file_path);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send(`File not found: ${doc.file_path}`);
  }

  await logDocumentAccess({ documentId: doc.id, userId: user.id, action: "DOWNLOAD", req });
  res.download(filePath, buildDownloadName(doc));
});

module.exports = router;
