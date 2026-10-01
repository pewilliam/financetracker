import { useEffect, useRef, useState } from "react";

export function useHideOnScroll({ disabled = false, scrollThreshold = 80, deltaThreshold = 8 } = {}) {
  const [hidden, setHidden] = useState(false);
  const anchorRef = useRef(0);

  useEffect(() => {
    anchorRef.current = Math.max(window.scrollY, 0);

    if (disabled) {
      setHidden(false);
      return undefined;
    }

    let frame = 0;

    const update = () => {
      frame = 0;
      const nextY = Math.max(window.scrollY, 0);

      if (nextY <= scrollThreshold) {
        anchorRef.current = nextY;
        setHidden(false);
        return;
      }

      const delta = nextY - anchorRef.current;
      if (delta > deltaThreshold) {
        anchorRef.current = nextY;
        setHidden(true);
      } else if (delta < -deltaThreshold) {
        anchorRef.current = nextY;
        setHidden(false);
      }
    };

    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [deltaThreshold, disabled, scrollThreshold]);

  return hidden;
}
