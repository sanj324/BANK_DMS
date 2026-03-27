const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 50);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg"
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg"]);
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 2555); // ~7 years
const ADMIN_ROLES = new Set(["ADMIN", "CHECKER", "SUPER_ADMIN", "admin", "checker", "super_admin"]);

module.exports = {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  RETENTION_DAYS,
  ADMIN_ROLES
};
