import { useEffect } from "react";
import useBodyScrollLock from "./useBodyScrollLock.js";

export default function useModalLifecycle({ onClose, busy = false, initialFocusRef = null, autoFocus = true }) {
  useBodyScrollLock(true);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy && !document.querySelector(".filter-select-menu")) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  useEffect(() => {
    if (!autoFocus || !initialFocusRef?.current) return undefined;
    const focusFrame = requestAnimationFrame(() => initialFocusRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(focusFrame);
  }, [autoFocus, initialFocusRef]);
}
