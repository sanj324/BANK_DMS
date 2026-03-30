import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { getTenantBrandingFromStorage } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function MainLayout() {
  const role = localStorage.getItem("role");
  const [branding, setBranding] = useState(getTenantBrandingFromStorage());
  const isClientAdmin = role === "client_admin" || role === "CLIENT_ADMIN";
  const canSeeAdmin =
    role === "CHECKER" ||
    role === "ADMIN" ||
    role === "admin" ||
    role === "checker" ||
    role === "super_admin" ||
    role === "SUPER_ADMIN";

  const sidebarBg = branding?.primary_color || "#0f2a44";
  const mainBg = branding?.secondary_color ? `${branding.secondary_color}14` : "#f4f6f8";
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const syncBranding = () => setBranding(getTenantBrandingFromStorage());
    window.addEventListener("tenant-branding-updated", syncBranding);
    window.addEventListener("storage", syncBranding);
    window.addEventListener("focus", syncBranding);
    return () => {
      window.removeEventListener("tenant-branding-updated", syncBranding);
      window.removeEventListener("storage", syncBranding);
      window.removeEventListener("focus", syncBranding);
    };
  }, []);

  return (
    <div style={styles.wrapper}>
      <aside style={{ ...styles.sidebar, background: sidebarBg }}>
        <div style={styles.brandWrap}>
          {branding?.logo_url ? (
            <img
              src={`${API_URL}/${branding.logo_url}`}
              alt="Client Logo"
              style={styles.logo}
            />
          ) : null}
          <div>
            <h3 style={{ margin: 0 }}>{branding?.client_name || "Bank DMS"}</h3>
            <div style={styles.platformTag}>Powered by Bank DMS</div>
          </div>
        </div>

        <Link to="/dashboard" style={styles.navLink}>Dashboard</Link>
        <Link to="/documents" style={styles.navLink}>Documents</Link>

        {role === "CHECKER" && (
          <Link to="/audit" style={styles.navLink}>Audit</Link>
        )}

        {canSeeAdmin && (
          <Link to="/admin" style={styles.navLink}>Admin</Link>
        )}

        {isClientAdmin && (
          <Link to="/tenant" style={styles.navLink}>Client Admin</Link>
        )}
      </aside>

      <main style={{ ...styles.main, background: mainBg }}>
        <div style={styles.pageContent}>
          <Outlet />
        </div>
        <footer style={styles.footer}>
          <span>© {currentYear} Bank DMS. All rights reserved.</span>
          {branding?.client_name ? <span>Customized workspace for {branding.client_name}</span> : null}
        </footer>
      </main>
    </div>
  );
}

const styles = {
  wrapper: { display: "flex", minHeight: "100vh" },
  sidebar: {
    width: "220px",
    color: "#fff",
    padding: "15px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px"
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px"
  },
  logo: {
    width: "28px",
    height: "28px",
    objectFit: "contain" as const,
    borderRadius: "6px",
    background: "rgba(255,255,255,0.1)"
  },
  navLink: {
    color: "#fff",
    textDecoration: "none"
  },
  platformTag: {
    fontSize: "11px",
    opacity: 0.9
  },
  main: {
    flex: 1,
    background: "#f4f6f8",
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100vh"
  },
  pageContent: { flex: 1, padding: "20px" },
  footer: {
    borderTop: "1px solid #d2ddeb",
    padding: "10px 20px",
    fontSize: "12px",
    color: "#4b6682",
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    flexWrap: "wrap" as const,
    background: "rgba(255,255,255,0.7)"
  }
};
