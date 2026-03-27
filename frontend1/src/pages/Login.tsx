import { useState } from "react";
import { loginUser } from "../services/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginUser(username, password);

      // Store auth details
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);

      // Redirect to dashboard
      window.location.href = "/dashboard";
    } catch (err) {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.container} onSubmit={handleLogin}>
        <h2>Bank / NBFC DMS Login</h2>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.field}>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div style={styles.field}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        <p style={styles.note}>
          Authorized users only. All access is logged.
        </p>
      </form>
    </div>
  );
}

const styles = {
  page: {
    backgroundColor: "#f4f6f8",
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  container: {
    width: "340px",
    padding: "25px",
    backgroundColor: "#fff",
    borderRadius: "6px",
    border: "1px solid #ddd",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
  },
  field: {
    marginBottom: "15px",
    display: "flex",
    flexDirection: "column" as const
  },
  error: {
    color: "red",
    marginBottom: "10px"
  },
  note: {
    marginTop: "15px",
    fontSize: "12px",
    color: "#666"
  }
};
