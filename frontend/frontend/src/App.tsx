import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import Audit from "./pages/Audit";
import AdminPortal from "./pages/AdminPortal";
import ClientTenantPanel from "./pages/ClientTenantPanel";
import MainLayout from "./layouts/MainLayout";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/admin" element={<AdminPortal />} />
          <Route path="/tenant" element={<ClientTenantPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
