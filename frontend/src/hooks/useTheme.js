import { useEffect, useSyncExternalStore } from "react";

const THEME_KEY = "finance-theme";
const listeners = new Set();

function readTheme() {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(THEME_KEY) || "light";
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (next) => {
    applyTheme(next);
    notify();
  };

  return { theme, setTheme };
}
