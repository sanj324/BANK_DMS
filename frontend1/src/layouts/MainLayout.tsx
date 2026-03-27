import { Link, Outlet } from "react-router-dom";

export default function MainLayout() {
  const role = localStorage.getItem("role");

  return (
    <div style={styles.wrapper}>
      <aside style={styles.sidebar}>
        <h3>Bank DMS</h3>

        <Link to="/dashboard">Dashboard</Link>
        <Link to="/documents">Documents</Link>

        {role === "CHECKER" && (
          <Link to="/audit">Audit</Link>
        )}
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  wrapper: { display: "flex", minHeight: "100vh" },
  sidebar: {
    width: "220px",
    background: "#0f2a44",
    color: "#fff",
    padding: "15px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px"
  },
  main: { flex: 1, padding: "20px", background: "#f4f6f8" }
};
