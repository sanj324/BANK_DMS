const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const auditLog = require("../middleware/auditLogger");
const {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  RETENTION_DAYS,
  ADMIN_ROLES
} = require("../config/policies");

const router = express.Router();

const uploadRoot = path.join(__dirname, "../../uploads");
const userUploadRoot = path.join(uploadRoot, "users");

if (!fs.existsSync(userUploadRoot)) {
  fs.mkdirSync(userUploadRoot, { recursive: true });
}

function sanitizeFolderName(value) {
  return String(value || "").replace(/[^\w.-]/g, "_");
}

function isSecureUpload(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (req.secure || forwardedProto.includes("https")) return true;

  const host = String(req.headers.host || "");
  if (host.includes("localhost") || host.includes("127.0.0.1")) return true;

  return process.env.NODE_ENV !== "production";
}

function getExtension(filename) {
  return path.extname(String(filename || "")).toLowerCase();
}

async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function resolveUserFolderId(userId, username) {
  const usersRoot = await pool.query(
    "SELECT id FROM folders WHERE parent_id IS NULL AND LOWER(name) = 'users' LIMIT 1"
  );

  let usersRootId = usersRoot.rows[0]?.id;
  if (!usersRootId) {
    const createdRoot = await pool.query(
      "INSERT INTO folders (name, parent_id, created_by) VALUES ('users', NULL, $1) RETURNING id",
      [userId]
    );
    usersRootId = createdRoot.rows[0].id;
  }

  const existingFolder = await pool.query(
    "SELECT id FROM folders WHERE parent_id = $1 AND name = $2 LIMIT 1",
    [usersRootId, username]
  );
  if (existingFolder.rows.length) return existingFolder.rows[0].id;

  const createdFolder = await pool.query(
    "INSERT INTO folders (name, parent_id, created_by) VALUES ($1, $2, $3) RETURNING id",
    [username, usersRootId, userId]
  );
  return createdFolder.rows[0].id;
}

function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function bytesToMbRounded(bytes) {
  return Math.max(1, Math.ceil(Number(bytes || 0) / (1024 * 1024)));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const username = sanitizeFolderName(req.user?.username || "unknown");
      const destination = path.join(userUploadRoot, username);
      fs.mkdirSync(destination, { recursive: true });
      cb(null, destination);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname || "upload.bin");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = getExtension(file.originalname);
    const allowed = ALLOWED_MIME_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext);
    if (!allowed) {
      return cb(
        new Error("Unsupported file type. Allowed: PDF, DOCX, XLSX, PNG, JPG"),
        false
      );
    }
    return cb(null, true);
  }
});

/* ======================================================
   UPLOAD DOCUMENT (MAKER)
====================================================== */

router.post("/", auth, (req, res) => {
  upload.single("document")(req, res, async (uploadErr) => {
    if (uploadErr instanceof multer.MulterError && uploadErr.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: `File too large. Maximum allowed is ${MAX_FILE_SIZE_MB} MB`
      });
    }

    if (uploadErr) {
      return res.status(400).json({ message: uploadErr.message || "Upload failed" });
    }

    try {
    if (!isSecureUpload(req)) {
      safeUnlink(req.file?.path);
      return res.status(403).json({ message: "HTTPS is required for secure upload" });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "No file received"
      });
    }

    if (req.file.size > MAX_FILE_SIZE_BYTES) {
      safeUnlink(req.file.path);
      return res.status(413).json({
        message: `File too large. Maximum allowed is ${MAX_FILE_SIZE_MB} MB`
      });
    }

    const { name, folderId } = req.body;
    const checksumHeader = String(req.headers["x-file-checksum"] || "").trim().toLowerCase();
    if (!checksumHeader) {
      safeUnlink(req.file.path);
      return res.status(400).json({ message: "x-file-checksum header is required" });
    }

    const calculatedChecksum = await computeFileSha256(req.file.path);
    if (checksumHeader !== calculatedChecksum) {
      safeUnlink(req.file.path);
      return res.status(400).json({ message: "Checksum mismatch. Upload rejected." });
    }

    const assignedFolderId = folderId
      ? Number(folderId)
      : await resolveUserFolderId(req.user.id, req.user.username);

    const folderCheck = await pool.query(
      "SELECT id, folder_id, created_by, quota_mb, client_id FROM folders WHERE id = $1",
      [assignedFolderId]
    );
    if (!folderCheck.rows.length) {
      safeUnlink(req.file.path);
      return res.status(404).json({ message: "Folder not found" });
    }

    const isAdmin = ADMIN_ROLES.has(req.user.role);
    if (!isAdmin && req.user.client_id && Number(folderCheck.rows[0].client_id || 0) !== Number(req.user.client_id || 0)) {
      safeUnlink(req.file.path);
      return res.status(403).json({
        message: "You can upload only within your tenant folders"
      });
    }

    if (!isAdmin && !req.user.client_id && folderCheck.rows[0].created_by !== req.user.id) {
      safeUnlink(req.file.path);
      return res.status(403).json({
        message: "You can upload only to your allocated folder"
      });
    }

    const storageUsage = await pool.query(
      `
      SELECT COALESCE(SUM(file_size_mb), 0)::int AS used_mb
      FROM files
      WHERE folder_id = $1
      `,
      [folderCheck.rows[0].folder_id]
    );

    const usedMb = Number(storageUsage.rows[0]?.used_mb || 0);
    const incomingMb = bytesToMbRounded(req.file.size);
    const quotaMb = Number(folderCheck.rows[0].quota_mb || 50);
    const clientId = req.user.client_id || folderCheck.rows[0].client_id || null;
    const fileType = getExtension(req.file.originalname).replace(".", "").toLowerCase();

    if (clientId) {
      const clientPolicy = await pool.query(
        `
        SELECT storage_quota_mb, allowed_file_types
        FROM clients
        WHERE client_id = $1
        `,
        [clientId]
      );

      if (clientPolicy.rows.length) {
        const allowedTypes = (clientPolicy.rows[0].allowed_file_types || []).map((x) =>
          String(x).toLowerCase()
        );

        if (allowedTypes.length && !allowedTypes.includes(fileType)) {
          safeUnlink(req.file.path);
          return res.status(400).json({
            message: `File type .${fileType} is not allowed for this client`,
            code: "FILE_TYPE_NOT_ALLOWED"
          });
        }

        const clientUsage = await pool.query(
          "SELECT COALESCE(SUM(file_size_mb), 0)::int AS used_mb FROM files WHERE client_id = $1",
          [clientId]
        );
        const usedClientMb = Number(clientUsage.rows[0]?.used_mb || 0);
        const clientQuotaMb = Number(clientPolicy.rows[0].storage_quota_mb || 1024);

        if (usedClientMb + incomingMb > clientQuotaMb) {
          safeUnlink(req.file.path);
          return res.status(400).json({
            message: `Client quota exceeded. Used ${usedClientMb} MB of ${clientQuotaMb} MB`,
            code: "CLIENT_QUOTA_EXCEEDED"
          });
        }
      }
    }

    if (usedMb + incomingMb > quotaMb) {
      safeUnlink(req.file.path);
      return res.status(400).json({
        message: `Folder quota exceeded. Used ${usedMb} MB of ${quotaMb} MB`,
        code: "QUOTA_EXCEEDED"
      });
    }

    const logicalName = (name || req.file.originalname).trim();
    const version = await pool.query(
      `
      SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
      FROM documents
      WHERE LOWER(name) = LOWER($1)
        AND folder_id IS NOT DISTINCT FROM $2
      `,
      [logicalName, assignedFolderId]
    );

    const nextVersion = Number(version.rows[0].next_version || 1);
    const retentionUntil = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const relativePath = path
      .relative(uploadRoot, req.file.path)
      .split(path.sep)
      .join("/");

    const insertResult = await pool.query(
      `
      INSERT INTO documents
      (name, file_path, status, uploaded_by, folder_id, file_size, checksum_sha256, version_no, retention_until)
      VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        logicalName,
        relativePath,
        req.user.id,
        assignedFolderId,
        req.file.size,
        calculatedChecksum,
        nextVersion,
        retentionUntil
      ]
    );

    await pool.query(
      `
      INSERT INTO files (folder_id, client_id, filename, file_size_mb, file_type, uploaded_at, checksum)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      `,
      [
        folderCheck.rows[0].folder_id,
        clientId,
        req.file.originalname,
        incomingMb,
        fileType,
        calculatedChecksum
      ]
    );

    await auditLog({
      userId: req.user.id,
      action: "UPLOAD_DOCUMENT",
      entity: "DOCUMENT",
      entityId: insertResult.rows[0].id
    });

    return res.json({
      success: true,
      message: "Upload successful",
      metadata: {
        id: insertResult.rows[0].id,
        filename: logicalName,
        storagePath: relativePath,
        size: req.file.size,
        checksum: calculatedChecksum,
        version: nextVersion,
        retentionUntil
      }
    });

    } catch (err) {
      if (req.file?.path) safeUnlink(req.file.path);

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message: `File too large. Maximum allowed is ${MAX_FILE_SIZE_MB} MB`
        });
      }

      if (err.message && err.message.includes("Unsupported file type")) {
        return res.status(400).json({ message: err.message });
      }

      console.error("UPLOAD ERROR:", err.message);
      return res.status(500).json({
        message: err.message || "Upload failed"
      });
    }
  });
});
/* ======================================================
   LIST DOCUMENTS
   MAKER → only own
   CHECKER → all documents
====================================================== */

router.get("/", auth, async (req, res) => {
  try {
    const folderId = req.query?.folderId ? Number(req.query.folderId) : null;

    let query = `
      SELECT 
        d.id,
        d.name,
        d.version_no,
        d.status,
        d.uploaded_by,
        d.folder_id,
        f.name AS folder_name,
        d.file_size,
        d.created_at,
        d.retention_until,
        u.username AS modified_by
      FROM documents d
      JOIN users u ON d.uploaded_by = u.id
      LEFT JOIN folders f ON d.folder_id = f.id
    `;

    const params = [];
    const conditions = [];

    if (req.user.client_id) {
      conditions.push(`u.client_id = $${params.length + 1}`);
      params.push(req.user.client_id);
    } else if (!ADMIN_ROLES.has(req.user.role)) {
      conditions.push(`d.uploaded_by = $${params.length + 1}`);
      params.push(req.user.id);
    }

    if (folderId) {
      conditions.push(`d.folder_id = $${params.length + 1}`);
      params.push(folderId);
    }

    if (conditions.length) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY d.id DESC`;

    const result = await pool.query(query, params);

    return res.json(result.rows);

  } catch (err) {
    console.error("LIST ERROR:", err);
    return res.status(500).json({
      message: "Failed to fetch documents"
    });
  }
});

router.patch("/:id/move", auth, async (req, res) => {
  try {
    const documentId = Number(req.params.id);
    const targetFolderId = Number(req.body?.targetFolderId);

    if (!documentId || !targetFolderId) {
      return res.status(400).json({ message: "document id and targetFolderId are required" });
    }

    const docResult = await pool.query(
      "SELECT id, uploaded_by, folder_id, name, checksum_sha256 FROM documents WHERE id = $1",
      [documentId]
    );

    if (!docResult.rows.length) {
      return res.status(404).json({ message: "Document not found" });
    }

    const doc = docResult.rows[0];
    const folderResult = await pool.query(
      "SELECT id, created_by, folder_id, client_id FROM folders WHERE id = $1",
      [targetFolderId]
    );

    if (!folderResult.rows.length) {
      return res.status(404).json({ message: "Target folder not found" });
    }

    const isAdmin = ADMIN_ROLES.has(req.user.role);
    if (!isAdmin && req.user.client_id) {
      const tenantFolder = await pool.query("SELECT client_id FROM folders WHERE id = $1", [targetFolderId]);
      if (!tenantFolder.rows.length || Number(tenantFolder.rows[0].client_id || 0) !== Number(req.user.client_id || 0)) {
        return res.status(403).json({ message: "You can move files only to your tenant folders" });
      }
    } else if (!isAdmin && folderResult.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: "You can move files only to your own folders" });
    }

    const updated = await pool.query(
      `
      UPDATE documents d
      SET folder_id = $1
      FROM users u
      WHERE d.id = $2
        AND d.uploaded_by = u.id
        AND u.id = $3
        AND u.username = $4
      RETURNING d.id
      `,
      [targetFolderId, documentId, req.user.id, req.user.username]
    );

    if (!updated.rows.length) {
      return res.status(403).json({ message: "You can move only your own files" });
    }

    const sourceFolderKey = await pool.query(
      "SELECT folder_id FROM folders WHERE id = $1",
      [doc.folder_id]
    );

    const sourceLegacyFolderId = sourceFolderKey.rows[0]?.folder_id || null;
    const targetLegacyFolderId = folderResult.rows[0].folder_id;

    if (sourceLegacyFolderId && targetLegacyFolderId) {
      if (doc.checksum_sha256) {
        await pool.query(
          `
          UPDATE files
          SET folder_id = $1
          WHERE checksum = $2 AND folder_id = $3
          `,
          [targetLegacyFolderId, doc.checksum_sha256, sourceLegacyFolderId]
        );
      } else {
        await pool.query(
          `
          UPDATE files
          SET folder_id = $1
          WHERE filename = $2 AND folder_id = $3
          `,
          [targetLegacyFolderId, doc.name, sourceLegacyFolderId]
        );
      }
    }

    await auditLog({
      userId: req.user.id,
      action: "MOVE_FILE",
      entity: "DOCUMENT",
      entityId: documentId,
      details: `Moved document ${doc.name} from folder ${doc.folder_id || "none"} to ${targetFolderId}`
    });

    return res.json({ success: true, message: "File moved successfully" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Move failed" });
  }
});

module.exports = router;
