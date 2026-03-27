import { useEffect, useState } from "react";
import { fetchAuditLogs } from "../services/api";

export default function Audit() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchAuditLogs().then(setLogs);
  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h1 style={{ marginBottom: 25 }}>📝 Audit Trail</h1>

      <div
        style={{
          background: "white",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
        }}
      >
        <table
          width="100%"
          cellPadding={10}
          style={{ borderCollapse: "collapse" }}
        >
          <thead style={{ background: "#f5f7fa" }}>
            <tr>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Time</th>
            </tr>
          </thead>

          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} align="center">
                  No audit logs found
                </td>
              </tr>
            )}

            {logs.map((log) => (
              <tr
                key={log.id}
                style={{
                  borderBottom: "1px solid #eee"
                }}
              >
                <td>{log.username}</td>
                <td>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      background:
                        log.action.includes("UPLOAD")
                          ? "#E3F2FD"
                          : log.action.includes("APPROVE")
                          ? "#E8F5E9"
                          : "#FFF3E0",
                      color: "#333"
                    }}
                  >
                    {log.action}
                  </span>
                </td>
                <td>{log.entity}</td>
                <td>
                  {new Date(log.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
