import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Calculator, CalendarDays, ChartPie, Coins, CreditCard, Ellipsis, Layers, LayoutDashboard, Moon, Receipt, Repeat2, Settings, ShoppingBag, Sun, Wallet } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme.js";
import { useI18n } from "../../i18n/index.ts";

const DRAG_START_DISTANCE = 6;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isPathActive(pathname, path) {
  if (path === "/") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function BottomNavigation({ hidden = false }) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const surfaceRef = useRef(null);
  const itemRefs = useRef([]);
  const activeIndexRef = useRef(null);
  const dragRef = useRef(null);
  const draggingRef = useRef(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const [pointerDown, setPointerDown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragTargetIndex, setDragTargetIndex] = useState(null);
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

  const positionIndicatorAtItem = (index, animate = false) => {
    const surface = surfaceRef.current;
    const item = itemRefs.current[index];
    if (!surface || !item) return;
    const surfaceRect = surface.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    setIndicator((current) => ({
      x: itemRect.left - surfaceRect.left,
      width: itemRect.width,
      animationId: animate ? (current?.animationId || 0) + 1 : current?.animationId || 0,
      animate: Boolean(animate && current),
      settling: animate,
      dragStretch: 1,
      dragLean: 0,
    }));
  };

  const clearPointerGesture = () => {
    dragRef.current = null;
    draggingRef.current = false;
    setPointerDown(false);
    setDragging(false);
    setDragTargetIndex(null);
  };

  const handlePointerDown = (event) => {
    if ((event.button != null && event.button !== 0) || event.isPrimary === false) return;
    const handleRect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      grabOffset: event.clientX - handleRect.left,
      targetIndex: activeIndex,
      didDrag: false,
    };
    setPointerDown(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; the active selector still remains clickable.
    }
  };

  const handlePointerMove = (event) => {
    const gesture = dragRef.current;
    const surface = surfaceRef.current;
    if (!gesture || !surface || gesture.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - gesture.startX;
    const distanceY = event.clientY - gesture.startY;

    if (!gesture.didDrag) {
      if (Math.hypot(distanceX, distanceY) < DRAG_START_DISTANCE) return;
      if (Math.abs(distanceY) > Math.abs(distanceX) * 1.25) {
        clearPointerGesture();
        return;
      }
      gesture.didDrag = true;
      draggingRef.current = true;
      setDragging(true);
      setMoreOpen(false);
    }

    event.preventDefault();
    const surfaceRect = surface.getBoundingClientRect();
    const items = itemRefs.current.filter(Boolean);
    if (!items.length) return;
    const itemRects = items.map((item) => item.getBoundingClientRect());
    const nearestIndex = itemRects.reduce((nearest, rect, index) => {
      const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
      return distance < nearest.distance ? { index, distance } : nearest;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
    const targetRect = itemRects[nearestIndex];
    const minimumX = itemRects[0].left - surfaceRect.left;
    const maximumX = itemRects.at(-1).right - surfaceRect.left - targetRect.width;
    const nextX = clamp(event.clientX - surfaceRect.left - gesture.grabOffset, minimumX, maximumX);
    const movement = event.clientX - gesture.lastX;
    gesture.lastX = event.clientX;
    gesture.targetIndex = nearestIndex;
    setDragTargetIndex(nearestIndex);
    setIndicator((current) => ({
      x: nextX,
      width: targetRect.width,
      animationId: current?.animationId || 0,
      animate: false,
      settling: false,
      dragStretch: 1 + Math.min(Math.abs(movement) * .012, .16),
      dragLean: clamp(movement * .16, -4, 4),
    }));
  };

  const finishPointerGesture = (event, cancelled = false) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Some browsers release capture before pointerup; there is nothing else to do.
    }

    if (!gesture.didDrag || cancelled) {
      if (cancelled && gesture.didDrag) positionIndicatorAtItem(activeIndex, true);
      clearPointerGesture();
      if (!cancelled && activeIndex === links.length) setMoreOpen((value) => !value);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const targetIndex = gesture.targetIndex;
    positionIndicatorAtItem(targetIndex, true);
    clearPointerGesture();

    if (targetIndex === links.length) {
      setMoreOpen((value) => !value);
    } else if (links[targetIndex]) {
      navigate(links[targetIndex][1]);
    }
  };

  useLayoutEffect(() => {
    const measureIndicator = (animate = false) => {
      if (draggingRef.current) return;
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
    <nav
      ref={rootRef}
      className={`bottom-navigation${pointerDown ? " is-pressing" : ""}${dragging ? " is-dragging" : ""}`}
      aria-label={t("bottomNavigation.navigation")}
      hidden={hidden}
    >
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
              "--indicator-drag-stretch": indicator.dragStretch || 1,
              "--indicator-drag-lean": `${indicator.dragLean || 0}deg`,
            }}
            aria-hidden="true"
          >
            <span
              key={indicator.animationId}
              className={`bottom-navigation-liquid-body${indicator.animate ? " is-moving" : ""}${indicator.settling ? " is-settling" : ""}`}
            />
          </span>
        )}
        {indicator && (
          <span
            className="bottom-navigation-drag-handle"
            style={{
              "--indicator-x": `${indicator.x}px`,
              "--indicator-width": `${indicator.width}px`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => finishPointerGesture(event)}
            onPointerCancel={(event) => finishPointerGesture(event, true)}
            onLostPointerCapture={(event) => finishPointerGesture(event, true)}
            aria-hidden="true"
          />
        )}
        {links.map(([label, path, Icon], index) => (
          <NavLink
            key={path}
            ref={(element) => { itemRefs.current[index] = element; }}
            to={path}
            end={path === "/"}
            className={({ isActive }) => `bottom-navigation-item${isActive ? " active" : ""}${dragTargetIndex === index ? " is-drag-target" : ""}`}
          >
            <span className="bottom-navigation-icon" aria-hidden="true"><Icon /></span>
            <span className="bottom-navigation-label">{label}</span>
          </NavLink>
        ))}
        <button
          ref={(element) => { itemRefs.current[links.length] = element; }}
          className={`bottom-navigation-item bottom-navigation-more${moreIsActive ? " active" : ""}${dragTargetIndex === links.length ? " is-drag-target" : ""}`}
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
