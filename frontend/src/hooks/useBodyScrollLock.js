import { useLayoutEffect } from "react";

let activeLocks = 0;
let savedStyles = null;

function acquireScrollLock() {
  const body = document.body;
  const root = document.documentElement;

  if (activeLocks === 0) {
    savedStyles = {
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      rootOverflow: root.style.overflow,
    };
    const scrollbarWidth = Math.max(window.innerWidth - root.clientWidth, 0);
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";
    root.style.overflow = "hidden";
  }

  activeLocks += 1;

  return () => {
    activeLocks = Math.max(activeLocks - 1, 0);
    if (activeLocks !== 0 || !savedStyles) return;
    body.style.overflow = savedStyles.bodyOverflow;
    body.style.paddingRight = savedStyles.bodyPaddingRight;
    root.style.overflow = savedStyles.rootOverflow;
    savedStyles = null;
  };
}

export default function useBodyScrollLock(locked = true) {
  useLayoutEffect(() => {
    if (!locked) return undefined;
    return acquireScrollLock();
  }, [locked]);
}
