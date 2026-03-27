require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const documentRoutes = require("./routes/document.routes");
const approvalRoutes = require("./routes/approval.routes");
const folderRoutes = require("./routes/folders.routes");
const auditRoutes = require("./routes/audit.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const fileRoutes = require("./routes/file.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/approval", approvalRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/files", fileRoutes);

app.listen(5000, () => {
  console.log("🚀 DMS Server running on port 5000");
});
