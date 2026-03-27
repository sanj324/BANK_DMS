const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const auditLog = require("../middleware/auditLogger");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE username=$1",
      [username]
    );

    if (!result.rows.length)
      return res.status(401).json({ message: "Invalid user" });

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    await auditLog({
      userId: user.id,
      action: "LOGIN",
      entity: "USER",
      entityId: user.id
    });

    res.json({
      token,
      role: user.role
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
