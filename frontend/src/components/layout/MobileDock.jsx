import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Ellipsis, LayoutDashboard, Plus, Receipt } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useHideOnScroll } from "../../hooks/useHideOnScroll.js";
import { useI18n } from "../../i18n/index.ts";
import MoreSheet, { MORE_SHEET_PATHS } from "./MoreSheet.jsx";

export default function MobileDock({ hidden = false, onHiddenChange, onNew }) {
  const { t, language } = useI18n();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const hiddenOnScroll = useHideOnScroll({ disabled: moreOpen || hidden });
  const moreIsActive = moreOpen || MORE_SHEET_PATHS.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const links = [
    [t("bottomNavigation.home"), "/", LayoutDashboard],
    [t("bottomNavigation.month"), "/meses", CalendarDays],
    [t("bottomNavigation.invoices"), "/faturas", Receipt],
  ];

  useEffect(() => {
    setMoreOpen(false);
  }, [hidden, location.pathname]);

  useEffect(() => {
    onHiddenChange?.(hiddenOnScroll);
  }, [hiddenOnScroll, onHiddenChange]);

  return (
    <>
      <MoreSheet open={moreOpen} onClose={closeMore} />
      <nav
        className={`mobile-dock md:hidden${hiddenOnScroll ? " is-hidden" : ""}`}
        aria-label={t("bottomNavigation.navigation")}
        hidden={hidden}
      >
        <NavLink to={links[0][1]} end className={({ isActive }) => `mobile-dock-item${isActive ? " active" : ""}`}>
          <LayoutDashboard aria-hidden="true" />
          <span>{links[0][0]}</span>
        </NavLink>
        <NavLink to={links[1][1]} className={({ isActive }) => `mobile-dock-item${isActive ? " active" : ""}`}>
          <CalendarDays aria-hidden="true" />
          <span>{links[1][0]}</span>
        </NavLink>
        <button className="mobile-dock-new" type="button" onClick={onNew} aria-label={language === "en-US" ? "New transaction" : "Novo lançamento"}>
          <span aria-hidden="true"><Plus /></span>
        </button>
        <NavLink to={links[2][1]} className={({ isActive }) => `mobile-dock-item${isActive ? " active" : ""}`}>
          <Receipt aria-hidden="true" />
          <span>{links[2][0]}</span>
        </NavLink>
        <button
          className={`mobile-dock-item${moreIsActive ? " active" : ""}`}
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          aria-label={t("bottomNavigation.more")}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-controls="mobile-more-sheet"
        >
          <Ellipsis aria-hidden="true" />
          <span>{t("bottomNavigation.more")}</span>
        </button>
      </nav>
    </>
  );
}
