import useSingleKeyShortcut from "./useSingleKeyShortcut.js";

export const TOP_SHORTCUT_STORAGE_KEY = "kashy365-top-shortcut-enabled";

export function readTopShortcutEnabled() {
  try {
    return localStorage.getItem(TOP_SHORTCUT_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export default function useTopShortcut({ enabled, blocked, onTop }) {
  useSingleKeyShortcut({ shortcutKey: "t", enabled, blocked, onActivate: onTop });
}
