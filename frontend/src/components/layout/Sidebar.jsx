import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Receipt, Wallet, CreditCard, ChartPie, Layers, Repeat2, Calculator, Coins, Sparkles, ChevronsLeft, ChevronsRight, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useTheme } from "../../hooks/useTheme.js";
import { useI18n } from "../../i18n/index.ts";
import { BRAND_MARK_SRC } from "../../app/constants.js";

function SidebarContent({ open, setOpen }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [helper, setHelper] = useState(null);
  const links = [
    [t("sidebar.dashboard"), "/", LayoutDashboard],
    [t("sidebar.months"), "/meses", CalendarDays],
    [t("sidebar.invoices"), "/faturas", Receipt],
    [t("sidebar.cards"), "/cartoes", CreditCard],
    [t("sidebar.wallets"), "/carteiras", Wallet],
    [t("sidebar.categories"), "/categorias", ChartPie],
    [t("sidebar.installments"), "/parcelamentos", Layers],
    [t("sidebar.subscriptions"), "/assinaturas", Repeat2],
    [t("sidebar.simulator"), "/simulador", Calculator],
    [t("sidebar.receivables"), "/recebiveis", Coins],
    [t("sidebar.assistant"), "/assistente", Sparkles]
  ];
  const clearHelper = () => setHelper(null);
  const showHelper = (label, event) => {
    if (open || !label) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const top = Math.min(Math.max(rect.top + rect.height / 2, 24), window.innerHeight - 24);
    setHelper({
      label,
      left: rect.right + 12,
      top
    });
  };

  useEffect(() => {
    if (open) setHelper(null);
  }, [open]);

  return (
    <div className="sidebar-shell">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <Link
            className="sidebar-logo sidebar-action"
            to="/"
            aria-label="Kashy365"
            data-tooltip="Kashy365"
            onMouseEnter={(event) => showHelper("Kashy365", event)}
            onMouseLeave={clearHelper}
            onFocus={(event) => showHelper("Kashy365", event)}
            onBlur={clearHelper}
          >
            <span className="sidebar-logo-mark">
              <img className="sidebar-brand-mark" src={BRAND_MARK_SRC} alt="" aria-hidden="true" />
            </span>
            <span className="sidebar-wordmark"><strong>Kashy</strong><em>365</em></span>
          </Link>
          <button
            type="button"
            className="sidebar-toggle sidebar-action"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t("sidebar.collapse") : t("sidebar.expand")}
            aria-expanded={open}
            data-tooltip={open ? t("sidebar.collapseShort") : t("sidebar.expandShort")}
            onMouseEnter={(event) => showHelper(open ? t("sidebar.collapseShort") : t("sidebar.expandShort"), event)}
            onMouseLeave={clearHelper}
            onFocus={(event) => showHelper(open ? t("sidebar.collapseShort") : t("sidebar.expandShort"), event)}
            onBlur={clearHelper}
          >
            {open ? <ChevronsLeft className="sidebar-icon" /> : <ChevronsRight className="sidebar-icon" />}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label={t("sidebar.navigation")}>
          {links.map(([label, path, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              data-tooltip={label}
              className={({ isActive }) => `sidebar-action ${isActive ? "active" : ""}`}
              onMouseEnter={(event) => showHelper(label, event)}
              onMouseLeave={clearHelper}
              onFocus={(event) => showHelper(label, event)}
              onBlur={clearHelper}
            >
              <Icon className="sidebar-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <NavLink
          className={({ isActive }) => `sidebar-settings sidebar-action ${isActive ? "active" : ""}`}
          to="/configuracoes"
          data-tooltip={t("sidebar.settings")}
          onMouseEnter={(event) => showHelper(t("sidebar.settings"), event)}
          onMouseLeave={clearHelper}
          onFocus={(event) => showHelper(t("sidebar.settings"), event)}
          onBlur={clearHelper}
        >
          <Settings className="sidebar-icon" />
          <span>{t("sidebar.settings")}</span>
        </NavLink>
        <button
          className="theme-toggle sidebar-action"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-tooltip={t("sidebar.theme")}
          onMouseEnter={(event) => showHelper(t("sidebar.theme"), event)}
          onMouseLeave={clearHelper}
          onFocus={(event) => showHelper(t("sidebar.theme"), event)}
          onBlur={clearHelper}
        >
          {theme === "dark" ? <Sun className="sidebar-icon" /> : <Moon className="sidebar-icon" />}
          <span>{t("sidebar.theme")}</span>
        </button>
        <div
          className="user-card sidebar-action"
          data-tooltip={user?.name || t("sidebar.user")}
          onMouseEnter={(event) => showHelper(user?.name || t("sidebar.user"), event)}
          onMouseLeave={clearHelper}
          onFocus={(event) => showHelper(user?.name || t("sidebar.user"), event)}
          onBlur={clearHelper}
        >
          <div className="avatar">{user?.name?.[0]?.toUpperCase() || t("sidebar.user")[0]}</div>
          <div className="user-meta">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
        <button
          className="logout sidebar-action"
          onClick={logout}
          data-tooltip={t("sidebar.logout")}
          onMouseEnter={(event) => showHelper(t("sidebar.logout"), event)}
          onMouseLeave={clearHelper}
          onFocus={(event) => showHelper(t("sidebar.logout"), event)}
          onBlur={clearHelper}
        >
          <LogOut className="sidebar-icon" />
          <span>{t("sidebar.logout")}</span>
        </button>
      </div>
      {helper && (
        <div
          className="sidebar-helper-tooltip"
          role="tooltip"
          style={{ left: helper.left, top: helper.top }}
        >
          {helper.label}
        </div>
      )}
    </div>
  );
}

function Sidebar({ open, setOpen }) {
  return (
    <aside className={`sidebar hidden md:flex ${open ? "open" : ""}`}>
      <SidebarContent open={open} setOpen={setOpen} />
    </aside>
  );
}


export default Sidebar;
