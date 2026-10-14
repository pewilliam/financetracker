import { useEffect, useRef } from "react";

// Keep Escape handling in mount order so a nested modal closes before its parent.
const openModals = [];
const OPEN_POPOVERS = [
  ".category-multi-menu", ".filter-select-menu", ".date-popover",
  ".expense-picker.open .expense-picker-panel",
  ".person-picker.open .person-picker-panel",
].join(", ");

export function hasOpenPicker() {
  return Boolean(document.querySelector(OPEN_POPOVERS));
}

export default function useModalEscape({ onClose, active = true, busy = false }) {
  const entryRef = useRef({ onClose, busy });
  entryRef.current.onClose = onClose;
  entryRef.current.busy = busy;

  useEffect(() => {
    if (!active) return undefined;

    const entry = entryRef.current;
    openModals.push(entry);
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || entry.busy) return;
      if (openModals[openModals.length - 1] !== entry || hasOpenPicker()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      entry.onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openModals.indexOf(entry);
      if (index !== -1) openModals.splice(index, 1);
    };
  }, [active]);
}
