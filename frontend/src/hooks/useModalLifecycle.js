import { useEffect } from "react";
import useBodyScrollLock from "./useBodyScrollLock.js";
import useModalEscape from "./useModalEscape.js";

export default function useModalLifecycle({ onClose, busy = false, initialFocusRef = null, autoFocus = true }) {
  useBodyScrollLock(true);

  useModalEscape({ onClose, busy });

  useEffect(() => {
    if (!autoFocus || !initialFocusRef?.current) return undefined;
    const focusFrame = requestAnimationFrame(() => initialFocusRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(focusFrame);
  }, [autoFocus, initialFocusRef]);
}
