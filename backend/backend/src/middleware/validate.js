function fail(res, message) {
  return res.status(400).json({ message });
}

function validateLogin(req, res, next) {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) return fail(res, "username and password are required");
  if (username.length < 3 || username.length > 80) return fail(res, "username length is invalid");
  return next();
}

function validateSignup(req, res, next) {
  const username = String(req.body?.username || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!username || !email || !password) return fail(res, "username, email and password are required");
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    return fail(res, "username must be 3-40 chars and only contain letters, digits, dot, underscore, hyphen");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, "invalid email format");
  if (password.length < 8) return fail(res, "password must be at least 8 characters");
  return next();
}

function validateTenantUserCreate(req, res, next) {
  const username = String(req.body?.username || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "maker").toLowerCase();
  const allowed = new Set(["maker", "checker", "viewer", "user"]);
  if (!username || !email || !password) return fail(res, "username, email and password are required");
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    return fail(res, "username must be 3-40 chars and only contain letters, digits, dot, underscore, hyphen");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, "invalid email format");
  if (password.length < 8) return fail(res, "password must be at least 8 characters");
  if (!allowed.has(role)) return fail(res, "role must be maker, checker, viewer, or user");
  return next();
}

module.exports = {
  validateLogin,
  validateSignup,
  validateTenantUserCreate
};
