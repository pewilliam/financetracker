import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

function isValidDateParts(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day || !isValidDateParts(year, month, day)) return null;
  return new Date(year, month - 1, day);
}

function formatDisplayDate(value) {
  const date = parseIsoDate(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR");
}

function parseDisplayDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (!isValidDateParts(year, month, day)) return "";
  return toIsoDate(year, month, day);
}

function formatTypedDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function monthLabel(date) {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildMonthDays(cursor) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = firstDay.getDay();
  const start = new Date(year, month, 1 - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      iso: toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      currentMonth: date.getMonth() === month
    };
  });
}

export default function DateField({ value, onChange, onBlur, className = "", ariaInvalid = false }) {
  const parsedValue = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatDisplayDate(value));
  const [cursor, setCursor] = useState(parsedValue || new Date());
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const [popoverStyle, setPopoverStyle] = useState(null);

  useEffect(() => {
    setText(formatDisplayDate(value));
    if (parsedValue) setCursor(parsedValue);
  }, [value]);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (rootRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const updatePopoverPosition = () => {
      const root = rootRef.current;
      const popover = popoverRef.current;
      if (!root || !popover) return;

      const rootRect = root.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewportPadding = 16;
      const gap = 8;

      let left = rootRect.left;
      if (left + popoverRect.width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - popoverRect.width - viewportPadding;
      }
      left = Math.max(viewportPadding, left);

      let top = rootRect.bottom + gap;
      if (top + popoverRect.height > window.innerHeight - viewportPadding) {
        top = rootRect.top - popoverRect.height - gap;
      }
      top = Math.max(viewportPadding, top);

      setPopoverStyle({
        top: Math.round(top),
        left: Math.round(left)
      });
    };

    const raf = requestAnimationFrame(updatePopoverPosition);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, cursor]);

  const days = useMemo(() => buildMonthDays(cursor), [cursor]);
  const todayIso = toIsoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  const moveMonth = (delta) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const selectDate = (nextValue) => {
    onChange(nextValue);
    setText(formatDisplayDate(nextValue));
    setCursor(parseIsoDate(nextValue) || cursor);
    setOpen(false);
    onBlur?.();
  };

  const handleInputBlur = () => {
    const nextValue = parseDisplayDate(text);
    if (nextValue) onChange(nextValue);
    else setText(formatDisplayDate(value));
    onBlur?.();
  };

  return (
    <div className={`date-field ${open ? "open" : ""} ${className}`} ref={rootRef}>
      <div className="date-input-shell">
        <input
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={text}
          onBlur={handleInputBlur}
          onChange={(event) => setText(formatTypedDate(event.target.value))}
          onFocus={() => setOpen(true)}
          aria-invalid={ariaInvalid}
        />
        <button type="button" className="date-trigger" onClick={() => setOpen((current) => !current)} aria-label="Abrir calendário">
          <CalendarDays size={16} />
        </button>
      </div>

      {open && createPortal(
        <div className="date-popover date-popover-floating" ref={popoverRef} style={popoverStyle ? { top: `${popoverStyle.top}px`, left: `${popoverStyle.left}px` } : undefined}>
          <div className="date-popover-head">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <strong>{monthLabel(cursor)}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
          <div className="date-weekdays">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="date-days">
            {days.map((day) => (
              <button
                type="button"
                key={day.iso}
                className={`${day.currentMonth ? "" : "muted"} ${day.iso === value ? "selected" : ""} ${day.iso === todayIso ? "today" : ""}`}
                onClick={() => selectDate(day.iso)}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function parseMonthValue(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return new Date();
  return new Date(year, month - 1, 1);
}

function formatMonthDisplay(value) {
  const date = parseMonthValue(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${month}/${date.getFullYear()}`;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function MonthField({ value, onChange }) {
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const parsed = parseMonthValue(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(parsed.getFullYear());
  const [popoverStyle, setPopoverStyle] = useState(null);

  useEffect(() => {
    setYear(parseMonthValue(value).getFullYear());
  }, [value]);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (rootRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const updatePopoverPosition = () => {
      const root = rootRef.current;
      const popover = popoverRef.current;
      if (!root || !popover) return;

      const rootRect = root.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewportPadding = 16;
      const gap = 8;

      let left = rootRect.right - popoverRect.width;
      if (left < viewportPadding) left = rootRect.left;
      if (left + popoverRect.width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - popoverRect.width - viewportPadding;
      }
      left = Math.max(viewportPadding, left);

      let top = rootRect.bottom + gap;
      if (top + popoverRect.height > window.innerHeight - viewportPadding) {
        top = rootRect.top - popoverRect.height - gap;
      }
      top = Math.max(viewportPadding, top);

      setPopoverStyle({
        top: Math.round(top),
        left: Math.round(left)
      });
    };

    const raf = requestAnimationFrame(updatePopoverPosition);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, year]);

  const selectedMonth = parsed.getMonth() + 1;
  const selectedYear = parsed.getFullYear();

  const selectMonth = (month) => {
    onChange(`${year}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  };

  return (
    <div className={`date-field month-field ${open ? "open" : ""}`} ref={rootRef}>
      <button type="button" className="date-input-shell month-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{formatMonthDisplay(value)}</span>
        <CalendarDays size={16} />
      </button>

      {open && createPortal(
        <div className="date-popover date-popover-floating month-popover" ref={popoverRef} style={popoverStyle ? { top: `${popoverStyle.top}px`, left: `${popoverStyle.left}px` } : undefined}>
          <div className="date-popover-head">
            <button type="button" onClick={() => setYear((current) => current - 1)} aria-label="Ano anterior"><ChevronLeft size={16} /></button>
            <strong>{year}</strong>
            <button type="button" onClick={() => setYear((current) => current + 1)} aria-label="Próximo ano"><ChevronRight size={16} /></button>
          </div>
          <div className="month-picker-grid">
            {MONTHS.map((month, index) => {
              const monthNumber = index + 1;
              return (
                <button
                  type="button"
                  key={month}
                  className={year === selectedYear && monthNumber === selectedMonth ? "selected" : ""}
                  onClick={() => selectMonth(monthNumber)}
                >
                  {month}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
