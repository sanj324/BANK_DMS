require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bootstrapDatabase = require("./config/bootstrap");
const securityHeaders = require("./middleware/securityHeaders");
const { createRateLimiter } = require("./middleware/rateLimit");
const security = require("./config/security");
const requestContext = require("./middleware/requestContext");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/users.routes");
const documentRoutes = require("./routes/document.routes");
const approvalRoutes = require("./routes/approval.routes");
const folderRoutes = require("./routes/folders.routes");
const auditRoutes = require("./routes/audit.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const fileRoutes = require("./routes/file.routes");
const complianceRoutes = require("./routes/compliance.routes");
const adminRoutes = require("./routes/admin.routes");
const clientRoutes = require("./routes/clients.routes");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(requestContext);
app.use(securityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (security.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-file-checksum"],
    credentials: false,
    optionsSuccessStatus: 204
  })
);
app.use(express.json({ limit: security.jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: security.jsonBodyLimit }));
app.use(
  "/api",
  createRateLimiter({
    windowMs: security.rateLimit.apiWindowMs,
    max: security.rateLimit.apiMax,
    message: "Too many API requests. Please slow down."
  })
);
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/approval", approvalRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/clients", clientRoutes);
app.use((err, req, res, next) => {
  if (err && /cors/i.test(String(err.message || ""))) {
    return res.status(403).json({ message: "CORS blocked for this origin" });
  }
  return next(err);
});

bootstrapDatabase()
  .then(() => {
    app.listen(5000, () => {
      console.log("DMS Server running on port 5000");
    });
  })
  .catch((err) => {
    console.error("Bootstrap failed:", err.message);
    process.exit(1);
  });
