const crypto = require("crypto");

module.exports = function requestContext(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  req.requestId = incoming || crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};
