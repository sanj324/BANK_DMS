const jwt = require("jsonwebtoken");
const security = require("../config/security");

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ message: "No token provided" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Invalid authorization header format" });
  }

  const token = parts[1];

  try {
    const verifyOptions = {
      algorithms: ["HS256"]
    };

    if (security.jwt.requireClaims) {
      verifyOptions.issuer = security.jwt.issuer;
      verifyOptions.audience = security.jwt.audience;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, verifyOptions);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};
