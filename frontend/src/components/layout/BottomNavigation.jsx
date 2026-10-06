import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Calculator, CalendarDays, ChartPie, Coins, CreditCard, Ellipsis, Layers, LayoutDashboard, Moon, Receipt, Repeat2, Settings, ShoppingBag, Sun, Wallet } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme.js";
import { useI18n } from "../../i18n/index.ts";

function isPathActive(pathname, path) {
  if (path === "/") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function BottomNavigation({ hidden = false }) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const rootRef = useRef(null);
  const surfaceRef = useRef(null);
  const itemRefs = useRef([]);
  const activeIndexRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const links = [
    [t("bottomNavigation.home"), "/", LayoutDashboard],
    [t("bottomNavigation.month"), "/meses", CalendarDays],
    [t("bottomNavigation.invoices"), "/faturas", Receipt],
    [t("bottomNavigation.cards"), "/cartoes", CreditCard],
    [t("bottomNavigation.wallets"), "/carteiras", Wallet],
    [t("bottomNavigation.budget"), "/categorias", ChartPie],
    [t("bottomNavigation.receivables"), "/recebiveis", Coins],
  ];
  const secondaryLinks = [
    [t("bottomNavigation.installments"), "/parcelamentos", Layers],
    [t("bottomNavigation.subscriptions"), "/assinaturas", Repeat2],
    [t("bottomNavigation.simulator"), "/simulador", Calculator],
    [t("bottomNavigation.desiredProducts"), "/produtos-desejados", ShoppingBag],
    [t("bottomNavigation.settings"), "/configuracoes", Settings],
  ];
  const settingsPath = "/configuracoes";
  const menuLinks = secondaryLinks.filter(([, path]) => path !== settingsPath);
  const settingsLink = secondaryLinks.find(([, path]) => path === settingsPath);
  const moreIsActive = secondaryLinks.some(([, path]) => isPathActive(location.pathname, path));
  const renderMenuLink = ([label, path, Icon]) => (
    <NavLink key={path} to={path} role="menuitem" className={({ isActive }) => isActive ? "active" : ""}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
  const directActiveIndex = links.findIndex(([, path]) => isPathActive(location.pathname, path));
  const activeIndex = directActiveIndex >= 0 ? directActiveIndex : moreIsActive ? links.length : 0;

  useLayoutEffect(() => {
    const measureIndicator = (animate = false) => {
      const surface = surfaceRef.current;
      const activeItem = itemRefs.current[activeIndex];
      if (!surface || !activeItem) return;
      const surfaceRect = surface.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const nextX = itemRect.left - surfaceRect.left;
      const nextWidth = itemRect.width;
      setIndicator((current) => {
        if (!animate && current && Math.abs(current.x - nextX) < .5 && Math.abs(current.width - nextWidth) < .5) return current;
        return {
          x: nextX,
          width: nextWidth,
          animationId: animate ? (current?.animationId || 0) + 1 : current?.animationId || 0,
          animate: Boolean(animate && current),
        };
      });
    };

    const animate = activeIndexRef.current !== null && activeIndexRef.current !== activeIndex;
    measureIndicator(animate);
    activeIndexRef.current = activeIndex;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measureIndicator(false));
    const handleResize = () => measureIndicator(false);
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [activeIndex]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname, hidden]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  return (
    <nav ref={rootRef} className="bottom-navigation hidden md:flex" aria-label={t("bottomNavigation.navigation")} hidden={hidden}>
      {moreOpen && (
        <div className="bottom-navigation-more-menu" role="menu" aria-label={t("bottomNavigation.moreMenu")}>
          {menuLinks.map(renderMenuLink)}
          <button
            type="button"
            role="menuitem"
            className="bottom-navigation-theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            <span>{t("bottomNavigation.theme")}</span>
          </button>
          {settingsLink && renderMenuLink(settingsLink)}
        </div>
      )}
      <div ref={surfaceRef} className="bottom-navigation-surface">
        {indicator && (
          <span
            className="bottom-navigation-liquid-indicator"
            style={{
              "--indicator-x": `${indicator.x}px`,
              "--indicator-width": `${indicator.width}px`,
            }}
            aria-hidden="true"
          >
            <span
              key={indicator.animationId}
              className={`bottom-navigation-liquid-body${indicator.animate ? " is-moving" : ""}`}
            />
          </span>
        )}
        {links.map(([label, path, Icon], index) => (
          <NavLink
            key={path}
            ref={(element) => { itemRefs.current[index] = element; }}
            to={path}
            end={path === "/"}
            className={({ isActive }) => `bottom-navigation-item${isActive ? " active" : ""}`}
          >
            <span className="bottom-navigation-icon" aria-hidden="true"><Icon /></span>
            <span className="bottom-navigation-label">{label}</span>
          </NavLink>
        ))}
        <button
          ref={(element) => { itemRefs.current[links.length] = element; }}
          className={`bottom-navigation-item bottom-navigation-more${moreIsActive ? " active" : ""}`}
          type="button"
          onClick={() => setMoreOpen((value) => !value)}
          aria-label={t("bottomNavigation.more")}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          <span className="bottom-navigation-icon" aria-hidden="true"><Ellipsis /></span>
          <span className="bottom-navigation-label">{t("bottomNavigation.more")}</span>
        </button>
      </div>
    </nav>
  );
}
