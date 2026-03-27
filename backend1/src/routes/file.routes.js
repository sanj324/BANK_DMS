const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const path = require("path");

const router = express.Router();

function validate(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

router.get("/view/:id", async (req, res) => {
  const user = validate(req.query.token);
  if (!user) return res.status(401).send("Invalid token");

  const result = await pool.query(
    "SELECT file_path FROM documents WHERE id=$1",
    [req.params.id]
  );

  if (!result.rows.length)
    return res.status(404).send("Not found");

  res.sendFile(path.resolve(result.rows[0].file_path));
});

router.get("/download/:id", async (req, res) => {
  const user = validate(req.query.token);
  if (!user) return res.status(401).send("Invalid token");

  const result = await pool.query(
    "SELECT file_path, name FROM documents WHERE id=$1",
    [req.params.id]
  );

  if (!result.rows.length)
    return res.status(404).send("Not found");

  res.download(
    path.resolve(result.rows[0].file_path),
    `${result.rows[0].name}.pdf`
  );
});

module.exports = router;
