function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ windowMs, max, keyGenerator, message }) {
  const hits = new Map();

  function cleanup(now) {
    for (const [key, state] of hits.entries()) {
      if (state.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    cleanup(now);

    const key = keyGenerator ? keyGenerator(req) : getClientIp(req);
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: message || "Too many requests. Please try again later."
      });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
  getClientIp
};
