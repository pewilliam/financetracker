import { Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage.jsx";
import AppShell from "./components/layout/AppShell.jsx";
import Protected from "./components/layout/Protected.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import { useAuth } from "./hooks/useAuth.jsx";
import { useI18n } from "./i18n/index.ts";

function HomeGate() {
  const auth = useAuth();
  const { t } = useI18n();
  if (auth.loading) return <div className="center-screen">{t("app.loadingSession")}</div>;
  if (auth.authenticated) return <AppShell />;
  return <LandingPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/" element={<HomeGate />} />
      <Route path="/*" element={<Protected><AppShell /></Protected>} />
    </Routes>
  );
}
