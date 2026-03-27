import { useEffect, useState } from "react";
import { fetchDashboardStats, fetchDocuments } from "../services/api";
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer,
  Legend
} from "recharts";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

export default function Dashboard() {

  const [stats, setStats] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    fetchDashboardStats().then(setStats);
    fetchDocuments().then(setDocuments);
  };

  if (!stats) return <div style={{ padding: 40 }}>Loading...</div>;

  const total = Number(stats.total);
  const pending = Number(stats.pending);
  const approved = Number(stats.approved);
  const rejected = Number(stats.rejected);

  /* =========================================
     1️⃣ RISK SCORE ENGINE
  ========================================= */

  const slaBreaches = documents.filter(doc => {
    if (!doc.created_at || doc.status === "APPROVED") return false;
    const diffDays =
      (Date.now() - new Date(doc.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    return diffDays > 2;
  }).length;

  const riskScore =
    (pending * 2 + rejected * 3 + slaBreaches * 4) / (total || 1);

  const riskPercentage = Math.min(Math.round(riskScore * 10), 100);

  const riskColor =
    riskPercentage > 70 ? "#C62828"
    : riskPercentage > 40 ? "#F57C00"
    : "#2E7D32";

  /* =========================================
     2️⃣ BRANCH SLA RANKING
  ========================================= */

  const branchStats: any = {};

  documents.forEach(doc => {
    const branch = doc.branch_name || "Head Office";

    if (!branchStats[branch]) {
      branchStats[branch] = { total: 0, breached: 0 };
    }

    branchStats[branch].total++;

    if (doc.created_at) {
      const diff =
        (Date.now() - new Date(doc.created_at).getTime()) /
        (1000 * 60 * 60 * 24);
      if (diff > 2 && doc.status !== "APPROVED") {
        branchStats[branch].breached++;
      }
    }
  });

  const branchRanking = Object.keys(branchStats)
    .map(branch => ({
      branch,
      breachRate:
        (branchStats[branch].breached /
          (branchStats[branch].total || 1)) * 100
    }))
    .sort((a, b) => a.breachRate - b.breachRate);

  /* =========================================
     3️⃣ REGULATORY COMPLIANCE SCORE
  ========================================= */

  const complianceScore =
    total === 0
      ? 100
      : Math.round((approved / total) * 100);

  /* =========================================
     4️⃣ AI-BASED ANOMALY DETECTION
     (Statistical Spike Detection)
  ========================================= */

  const userUploads: any = {};

  documents.forEach(doc => {
    const user = doc.uploaded_by || "Unknown";
    userUploads[user] = (userUploads[user] || 0) + 1;
  });

  const avgUploads =
    Object.values(userUploads).reduce((a: any, b: any) => a + b, 0) /
    (Object.keys(userUploads).length || 1);

  const anomalies = Object.keys(userUploads).filter(
    user => userUploads[user] > avgUploads * 2
  );

  /* =========================================
     STATUS PIE
  ========================================= */

  const pieData = [
    { name: "Pending", value: pending },
    { name: "Approved", value: approved },
    { name: "Rejected", value: rejected }
  ];

  const COLORS = ["#F57C00", "#2E7D32", "#C62828"];

  return (
    <div style={{ padding: 30, background: "#f4f7fb" }}>
      <h1>🏦 Enterprise Risk & Compliance Command Center</h1>

      {/* KPI GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 20,
        marginBottom: 30
      }}>
        <Card title="Total" value={total} color="#1565C0" />
        <Card title="Pending" value={pending} color="#F57C00" />
        <Card title="Approved" value={approved} color="#2E7D32" />
        <Card title="Rejected" value={rejected} color="#C62828" />
      </div>

      {/* RISK GAUGE */}
      <ChartCard title="Risk Score Gauge">
        <div style={{ width: 200, margin: "auto" }}>
          <CircularProgressbar
            value={riskPercentage}
            text={`${riskPercentage}%`}
            styles={buildStyles({
              pathColor: riskColor,
              textColor: riskColor
            })}
          />
        </div>
      </ChartCard>

      {/* BRANCH SLA LEADERBOARD */}
      <ChartCard title="Branch SLA Ranking Leaderboard">
        <table width="100%" cellPadding={10}>
          <thead>
            <tr>
              <th align="left">Rank</th>
              <th align="left">Branch</th>
              <th align="left">SLA Breach %</th>
            </tr>
          </thead>
          <tbody>
            {branchRanking.map((b, i) => (
              <tr key={b.branch}>
                <td>{i + 1}</td>
                <td>{b.branch}</td>
                <td>{b.breachRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {/* REGULATORY COMPLIANCE DASHBOARD */}
      <ChartCard title="Regulatory Compliance Score">
        <h2 style={{
          color: complianceScore > 80 ? "#2E7D32" : "#C62828"
        }}>
          {complianceScore}% Compliant
        </h2>
        <p>
          Based on approved document ratio vs total uploads.
        </p>
      </ChartCard>

      {/* AI ANOMALY SECTION */}
      <ChartCard title="AI Anomaly Detection">
        {anomalies.length === 0 ? (
          <p>No suspicious upload spikes detected.</p>
        ) : (
          <ul>
            {anomalies.map(user => (
              <li key={user}>
                ⚠️ {user} uploaded unusually high number of documents
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      {/* STATUS PIE */}
      <ChartCard title="Status Distribution">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pieData} dataKey="value" outerRadius={100} label>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  );
}

/* ================= COMPONENTS ================= */

function Card({ title, value, color }: any) {
  return (
    <div style={{
      background: "white",
      padding: 20,
      borderRadius: 12,
      boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
      borderTop: `5px solid ${color}`
    }}>
      <h4>{title}</h4>
      <h2 style={{ color }}>{value}</h2>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div style={{
      background: "white",
      padding: 25,
      borderRadius: 16,
      marginBottom: 30,
      boxShadow: "0 6px 20px rgba(0,0,0,0.08)"
    }}>
      <h3 style={{ marginBottom: 20 }}>{title}</h3>
      {children}
    </div>
  );
}
