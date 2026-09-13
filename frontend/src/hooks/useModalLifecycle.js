import { useEffect } from "react";

export default function useModalLifecycle({ onClose, busy = false, initialFocusRef = null, autoFocus = true }) {
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const alreadyFixed = body.style.position === "fixed";
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    if (!alreadyFixed) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
    }
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previous.overflow;
      if (alreadyFixed) return;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) onClose();
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
