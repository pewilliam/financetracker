import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AuthPage from "./pages/AuthPage.jsx";
import AppShell from "./components/layout/AppShell.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import { useAuth } from "./hooks/useAuth.jsx";
import { useI18n } from "./i18n/index.ts";

function ApplicationGate() {
  const auth = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (auth.loading) return <div className="center-screen">{t("app.loadingSession")}</div>;
  if (auth.authenticated) return <AppShell />;
  if (location.pathname === "/") return <LandingPage />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/*" element={<ApplicationGate />} />
    </Routes>
  );
}
