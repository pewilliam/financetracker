import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { BarChart3, CalendarDays, ChartNoAxesCombined, CreditCard, ChevronsLeft, ChevronsRight, List, LogOut, Moon, Settings, Sun, Wallet } from "lucide-react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useTheme } from "../../hooks/useTheme.js";
import { useI18n } from "../../i18n/index.ts";
import { BRAND_MARK_SRC } from "../../app/constants.js";

// Conteúdo interno da sidebar — compartilhado entre desktop e mobile
function SidebarContent({ open, setOpen, onClose }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const links = [
    [t("sidebar.dashboard"), "/", BarChart3],
    [t("sidebar.months"), "/meses", CalendarDays],
    [t("sidebar.invoices"), "/faturas", CreditCard],
    [t("sidebar.invoiceModels"), "/modelos-de-fatura", List],
    [t("sidebar.installments"), "/parcelamentos", CreditCard],
    [t("sidebar.simulator"), "/simulador", ChartNoAxesCombined],
    [t("sidebar.receivables"), "/recebiveis", Wallet]
  ];

  return (
    <div className="sidebar-shell">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <Link className="sidebar-logo sidebar-action" to="/" onClick={onClose} aria-label="Kashy365" data-tooltip="Kashy365">
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
              onClick={onClose}
              data-tooltip={label}
              className={({ isActive }) => `sidebar-action ${isActive ? "active" : ""}`}
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
          onClick={onClose}
          data-tooltip={t("sidebar.settings")}
        >
          <Settings className="sidebar-icon" />
          <span>{t("sidebar.settings")}</span>
        </NavLink>
        <button
          className="theme-toggle sidebar-action"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-tooltip={t("sidebar.theme")}
        >
          {theme === "dark" ? <Sun className="sidebar-icon" /> : <Moon className="sidebar-icon" />}
          <span>{t("sidebar.theme")}</span>
        </button>
        <div className="user-card sidebar-action" data-tooltip={user?.name || t("sidebar.user")}>
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
        >
          <LogOut className="sidebar-icon" />
          <span>{t("sidebar.logout")}</span>
        </button>
      </div>
    </div>
  );
}

// Sidebar desktop — sempre visível, expande/colapsa
function SidebarDesktop({ open, setOpen }) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <SidebarContent open={open} setOpen={setOpen} onClose={() => {}} />
    </aside>
  );
}

// Sidebar mobile — drawer com overlay, zero manipulação de body/overflow
function SidebarMobile({ open, setOpen }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const overlayRef = useRef(null);
  const stopBackgroundScroll = (event) => event.preventDefault();

  // Fecha ao pressionar Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Sincroniza theme-color com a cor da sidebar quando aberta
  useEffect(() => {
    const sidebarColor = "#07120E";
    const appColor = theme === "dark" ? "#0A1410" : "#F4FAF7";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = open ? sidebarColor : appColor;
    return () => { meta.content = appColor; };
  }, [open, theme]);

  return (
    <div
      ref={overlayRef}
      className={`mob-sidebar-overlay${open ? " mob-sidebar-overlay--open" : ""}`}
      aria-modal={open}
      role="dialog"
      aria-hidden={!open}
    >
      {/* Backdrop clicável — fecha o drawer */}
      <div
        className="mob-sidebar-backdrop"
        onClick={() => setOpen(false)}
        onTouchMove={stopBackgroundScroll}
        onWheel={stopBackgroundScroll}
        aria-label={t("sidebar.closeMenu")}
      />
      {/* Painel */}
      <aside className={`mob-sidebar-panel${open ? " mob-sidebar-panel--open" : ""}`}>
        <SidebarContent open={true} setOpen={setOpen} onClose={() => setOpen(false)} />
      </aside>
    </div>
  );
}

function Sidebar({ open, setOpen }) {
  return (
    <>
      <SidebarDesktop open={open} setOpen={setOpen} />
      <SidebarMobile open={open} setOpen={setOpen} />
    </>
  );
}


export default Sidebar;
