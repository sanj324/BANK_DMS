const { getClientIp } = require("./rateLimit");

function createLoginGuard({ windowMs, threshold }) {
  const failures = new Map();

  function getKey(username, ip) {
    return `${String(username || "").toLowerCase()}|${ip}`;
  }

  function purge(now) {
    for (const [key, state] of failures.entries()) {
      if (state.resetAt <= now) failures.delete(key);
    }
  }

  function recordFailure(username, ip) {
    const now = Date.now();
    purge(now);
    const key = getKey(username, ip);
    const current = failures.get(key);
    if (!current || current.resetAt <= now) {
      failures.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    current.count += 1;
  }

  function clearFailure(username, ip) {
    failures.delete(getKey(username, ip));
  }

  function isLocked(username, ip) {
    const now = Date.now();
    purge(now);
    const state = failures.get(getKey(username, ip));
    if (!state) return { locked: false, retryAfterSec: 0 };
    if (state.count < threshold) return { locked: false, retryAfterSec: 0 };
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((state.resetAt - now) / 1000))
    };
  }

  function lockoutMiddleware(req, res, next) {
    const username = req.body?.username;
    const ip = getClientIp(req);
    const status = isLocked(username, ip);
    if (!status.locked) return next();
    res.setHeader("Retry-After", String(status.retryAfterSec));
    return res.status(429).json({
      message: "Too many failed login attempts. Please try again later."
    });
  }

  return {
    recordFailure,
    clearFailure,
    isLocked,
    lockoutMiddleware
  };
}

module.exports = {
  createLoginGuard
};
