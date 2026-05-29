import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";

export default function AnimatedMoney({ value, className = "" }) {
  const { language } = useI18n();
  const [display, setDisplay] = useState(Number(value || 0));

  useEffect(() => {
    const start = display;
    const end = Number(value || 0);
    const startedAt = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / 400, 1);
      setDisplay(start + (end - start) * progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{formatMoney(display, language)}</span>;
}


