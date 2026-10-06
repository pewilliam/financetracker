import { useEffect, useRef, useState } from "react";
import { Calculator, ChartPie, Coins, CreditCard, Layers, LogOut, Moon, Repeat2, Settings, ShoppingBag, Sun, UserRound, Wallet } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useTheme } from "../../hooks/useTheme.js";
import { useI18n } from "../../i18n/index.ts";

export const MORE_SHEET_PATHS = [
  "/cartoes",
  "/carteiras",
  "/categorias",
  "/recebiveis",
  "/parcelamentos",
  "/assinaturas",
  "/simulador",
  "/produtos-desejados",
  "/configuracoes",
];

const EXIT_DURATION = 300;

export default function MoreSheet({ open, onClose }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const userName = String(user?.name || "").trim() || String(user?.email || "").split("@")[0] || t("sidebar.user");
  const userEmail = String(user?.email || "").trim() || "—";

  const links = [
    [t("bottomNavigation.cards"), "/cartoes", CreditCard],
    [t("bottomNavigation.wallets"), "/carteiras", Wallet],
    [t("bottomNavigation.budget"), "/categorias", ChartPie],
    [t("bottomNavigation.receivables"), "/recebiveis", Coins],
    [t("bottomNavigation.installments"), "/parcelamentos", Layers],
    [t("bottomNavigation.subscriptions"), "/assinaturas", Repeat2],
    [t("bottomNavigation.simulator"), "/simulador", Calculator],
    [t("bottomNavigation.desiredProducts"), "/produtos-desejados", ShoppingBag],
  ];

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    onClose();
    try {
      await new Promise((resolve) => window.setTimeout(resolve, EXIT_DURATION));
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    let frame;
    let timer;

    if (open) {
      setMounted(true);
      frame = window.requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      timer = window.setTimeout(() => setMounted(false), EXIT_DURATION);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll("a[href], button:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!mounted) return null;

  return (
    <div className={`more-sheet-root md:hidden${visible ? " is-open" : ""}`} aria-hidden={!open}>
      <button
        className="more-sheet-overlay"
        type="button"
        aria-label={t("sidebar.closeMenu")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="more-sheet-panel"
        id="mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-sheet-title"
        tabIndex={-1}
      >
        <div className="more-sheet-avatar" aria-hidden="true">
          <UserRound />
        </div>
        <div className="more-sheet-scroll">
          <div className="more-sheet-user">
            <div className="more-sheet-user-copy">
              <strong>{userName}</strong>
              <span>{userEmail}</span>
            </div>
          </div>
          <h2 id="mobile-more-sheet-title">{t("bottomNavigation.moreMenu")}</h2>
          <div className="more-sheet-grid">
            {links.map(([label, path, Icon]) => (
              <NavLink key={path} to={path} onClick={onClose} className={({ isActive }) => isActive ? "active" : ""}>
                <span aria-hidden="true"><Icon /></span>
                <small>{label}</small>
              </NavLink>
            ))}
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <span aria-hidden="true">{theme === "dark" ? <Sun /> : <Moon />}</span>
              <small>{t("bottomNavigation.theme")}</small>
            </button>
            <NavLink to="/configuracoes" onClick={onClose} className={({ isActive }) => isActive ? "active" : ""}>
              <span aria-hidden="true"><Settings /></span>
              <small>{t("bottomNavigation.settings")}</small>
            </NavLink>
          </div>
          <div className="more-sheet-logout-wrap">
            <button className="more-sheet-logout" type="button" onClick={handleLogout} disabled={loggingOut}>
              <LogOut aria-hidden="true" />
              <span>{t("sidebar.logout")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
