function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5178",
  "http://127.0.0.1:5178"
];

const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

module.exports = {
  allowedOrigins: CORS_ALLOWED_ORIGINS.length ? CORS_ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
  jwt: {
    issuer: process.env.JWT_ISSUER || "bank-dms",
    audience: process.env.JWT_AUDIENCE || "bank-dms-web",
    requireClaims: String(process.env.JWT_REQUIRE_CLAIMS || "false").toLowerCase() === "true",
    accessTtl: process.env.JWT_ACCESS_TTL || "8h",
    enableRefresh: String(process.env.JWT_ENABLE_REFRESH || "false").toLowerCase() === "true",
    refreshTtlDays: toInt(process.env.JWT_REFRESH_TTL_DAYS, 30)
  },
  rateLimit: {
    apiWindowMs: toInt(process.env.RATE_LIMIT_API_WINDOW_MS, 15 * 60 * 1000),
    apiMax: toInt(process.env.RATE_LIMIT_API_MAX, 1200),
    loginWindowMs: toInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000),
    loginMax: toInt(process.env.RATE_LIMIT_LOGIN_MAX, 15),
    lockWindowMs: toInt(process.env.LOGIN_LOCK_WINDOW_MS, 15 * 60 * 1000),
    lockThreshold: toInt(process.env.LOGIN_LOCK_THRESHOLD, 8)
  }
};
