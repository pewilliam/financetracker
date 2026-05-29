import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useI18n } from "../../i18n/index.ts";

export default function Protected({ children }) {
  const auth = useAuth();
  const { t } = useI18n();
  if (auth.loading) return <div className="center-screen">{t("app.loadingSession")}</div>;
  if (!auth.authenticated) return <Navigate to="/login" replace />;
  return children;
}


