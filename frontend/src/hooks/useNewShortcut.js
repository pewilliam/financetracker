import { useEffect } from "react";

export const NEW_SHORTCUT_STORAGE_KEY = "kashy365-new-shortcut-enabled";

export function readNewShortcutEnabled() {
  try {
    return localStorage.getItem(NEW_SHORTCUT_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export default function useNewShortcut({ enabled, blocked, onNew }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (blocked || event.defaultPrevented || event.repeat || event.isComposing || event.key?.toLowerCase() !== "n") return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

      // Do not hijack typing, searches, comboboxes or other editable controls.
      if (event.target instanceof Element && event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="listbox"], [role="menu"]'
      )) return;

      // Page-specific dialogs and popovers may not all be tracked by AppShell.
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"], [role="listbox"], [role="menu"][aria-expanded="true"]')) return;

      event.preventDefault();
      onNew();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, blocked, onNew]);
}
