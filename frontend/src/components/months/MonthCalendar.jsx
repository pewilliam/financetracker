import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Coins, MoveHorizontal, Plus } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney, formatMonthLabel } from "../../utils/format.js";
import { todayIsoDate } from "../../app/helpers.js";
import DayEntriesModal from "../../modals/DayEntriesModal.jsx";
import EntryDetailsModal from "../../modals/EntryDetailsModal.jsx";
import CalendarEntry from "./CalendarEntry.jsx";
import { entriesForDay } from "./calendarEntries.js";
import "./monthCalendar.css";

const DAILY_PREVIEW_LIMIT = 5;

export default function MonthCalendar({ days = [], year, month, invoices = [], onAdd, onEdit, onOpenReceivable, onLoadCategoryDetails, onOverlayChange, todayJump = 0 }) {
  const { language } = useI18n();
  const english = language === "en-US";
  const hintId = useId();
  const calendarRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingTransaction, setViewingTransaction] = useState(null);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const monthDays = useMemo(() => new Map(days.filter(day => day.date.startsWith(prefix)).map(day => [day.date.slice(0, 10), day])), [days, prefix]);
  const selectedDay = monthDays.get(selectedDate);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const length = new Date(year, month, 0).getDate();
  const slots = Math.ceil((firstWeekday + length) / 7) * 7;
  const today = todayIsoDate();
  useEffect(() => { setSelectedDate(null); setViewingTransaction(null); }, [year, month]);
  useEffect(() => {
    onOverlayChange?.(Boolean(selectedDay || viewingTransaction));
    return () => onOverlayChange?.(false);
  }, [selectedDay, viewingTransaction, onOverlayChange]);
  useEffect(() => {
    if (!todayJump) return;
    const frame = requestAnimationFrame(() => calendarRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [todayJump]);
  const openEntry = entry => {
    setSelectedDate(null);
    if (entry.kind === "receivable") onOpenReceivable?.(entry.item);
    else setViewingTransaction(entry.item);
  };
  const addEntry = date => { setSelectedDate(null); onAdd?.(date); };
  return <div className="month-calendar-view">
    <div className="month-calendar-toolbar"><div className="month-calendar-period"><CalendarDays size={19} /><strong>{formatMonthLabel(year, month, language)}</strong></div>
      <div className="month-calendar-legend"><span className="income"><ArrowUpRight size={14} />{english ? "Income" : "Ganhos"}</span><span className="expense"><ArrowDownLeft size={14} />{english ? "Expenses / invoices" : "Gastos / faturas"}</span><span className="planned"><Coins size={14} />{english ? "Expected" : "Previstos"}</span></div></div>
    <p id={hintId} className="month-calendar-scroll-hint"><MoveHorizontal size={15} />{english ? "Swipe to see the whole week." : "Deslize para ver toda a semana."}</p>
    <div ref={calendarRef} className="month-calendar-scroll" role="region" aria-label={english ? "Monthly calendar" : "Calendário mensal"} aria-describedby={hintId} tabIndex={0}>
      <div className="month-calendar-grid" role="table" aria-label={formatMonthLabel(year, month, language)} aria-colcount={7} aria-rowcount={slots / 7 + 1}>
        <div className="month-calendar-weekdays" role="row">{Array.from({ length: 7 }, (_, index) => <span role="columnheader" key={index}>{new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(2026, 2, 1 + index)).replace(".", "")}</span>)}</div>
        {Array.from({ length: slots / 7 }, (_, week) => <div className="month-calendar-week" role="row" key={week}>
          {Array.from({ length: 7 }, (_, weekday) => {
            const number = week * 7 + weekday - firstWeekday + 1;
            if (number < 1 || number > length) return <div className="month-calendar-day is-outside" role="cell" key={weekday} aria-hidden="true" />;
            const date = prefix + String(number).padStart(2, "0");
            const day = monthDays.get(date) || { date, transactions: [], planned_receivables: [] };
            const entries = entriesForDay(day);
            const dateLabel = new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
            return <div role="cell" aria-colindex={weekday + 1} aria-rowindex={week + 2} className={`month-calendar-day${date === today ? " is-today" : ""}${weekday === 0 || weekday === 6 ? " is-weekend" : ""}`} key={date} data-day={date} aria-label={dateLabel} aria-current={date === today ? "date" : undefined}>
              <div className="month-calendar-day-head"><span className="month-calendar-day-number">{number}</span>{date === today && <small>{english ? "Today" : "Hoje"}</small>}<button className="month-calendar-add" type="button" onClick={() => addEntry(date)} aria-label={`${english ? "Add entry on" : "Adicionar lançamento em"} ${dateLabel}`}><Plus size={14} /></button></div>
              <div className="month-calendar-entries">{entries.slice(0, DAILY_PREVIEW_LIMIT).map(entry => <CalendarEntry key={entry.key} entry={entry} onOpen={openEntry} />)}
                {!entries.length && <span className="month-calendar-empty">{english ? "No entries" : "Sem lançamentos"}</span>}</div>
              {entries.length > DAILY_PREVIEW_LIMIT && <button className="month-calendar-see-all" type="button" onClick={() => setSelectedDate(date)} aria-label={`${english ? "View all" : "Ver todos"} · ${dateLabel} · ${entries.length} ${english ? "entries" : "lançamentos"}`}><span>{english ? "View all" : "Ver todos"}</span><small>+{entries.length - DAILY_PREVIEW_LIMIT}</small></button>}
              {day.balance != null && <div className="month-calendar-balance"><span>{english ? "Balance" : "Saldo"}</span><strong className={Number(day.balance) < 0 ? "money-expense" : ""}>{formatMoney(day.balance, language)}</strong></div>}
            </div>;
          })}</div>)}
      </div>
    </div>
    {selectedDay && <DayEntriesModal day={selectedDay} onClose={() => setSelectedDate(null)} onOpen={openEntry} onAdd={addEntry} />}
    {viewingTransaction && <EntryDetailsModal item={viewingTransaction} invoice={invoices.find(invoice => invoice.id === viewingTransaction.invoice_id)} onLoadCategoryDetails={onLoadCategoryDetails} onClose={() => setViewingTransaction(null)} onEdit={() => { const item = viewingTransaction; setViewingTransaction(null); onEdit?.(item); }} />}
  </div>;
}
