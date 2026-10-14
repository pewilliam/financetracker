import { useEffect } from "react";

const EDITABLE_SELECTOR = [
  "input", "textarea", "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]', '[role="searchbox"]',
  '[role="combobox"]', '[role="listbox"]', '[role="menu"]',
].join(", ");

const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"]',
  '[role="listbox"]',
  '[role="menu"][aria-expanded="true"]',
  ".date-popover",
  ".category-multi-menu",
  ".expense-picker.open .expense-picker-panel",
  ".person-picker.open .person-picker-panel",
].join(", ");

export default function useSingleKeyShortcut({ shortcutKey, enabled, blocked, onActivate }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (blocked || event.defaultPrevented || event.repeat || event.isComposing) return;
      if (event.key?.toLowerCase() !== shortcutKey) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

      if (event.target instanceof Element && event.target.closest(EDITABLE_SELECTOR)) return;
      if (document.activeElement instanceof Element && document.activeElement.closest(EDITABLE_SELECTOR)) return;
      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return;

      event.preventDefault();
      onActivate();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcutKey, enabled, blocked, onActivate]);
}
