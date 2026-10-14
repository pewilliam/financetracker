import useSingleKeyShortcut from "./useSingleKeyShortcut.js";

export const NEW_SHORTCUT_STORAGE_KEY = "kashy365-new-shortcut-enabled";

export function readNewShortcutEnabled() {
  try {
    return localStorage.getItem(NEW_SHORTCUT_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export default function useNewShortcut({ enabled, blocked, onNew }) {
  useSingleKeyShortcut({ shortcutKey: "n", enabled, blocked, onActivate: onNew });
}
