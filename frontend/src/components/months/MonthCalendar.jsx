import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, Flame, MoveHorizontal } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney, formatMonthLabel } from "../../utils/format.js";
import { todayIsoDate } from "../../app/helpers.js";
import DayEntriesModal from "../../modals/DayEntriesModal.jsx";
import EntryDetailsModal from "../../modals/EntryDetailsModal.jsx";
import CalendarEntry from "./CalendarEntry.jsx";
import { calendarDays, describeEntry, entriesForDay, moveCalendarEntry } from "./calendarEntries.js";
import "./monthCalendar.css";

const PREVIEW_LIMIT = 2;
const moneySign = value => value > 0 ? "+ " : value < 0 ? "− " : "";

export default function MonthCalendar({ days = [], year, month, summary, openingBalance = 0, invoices = [], onAdd, onEdit, onOpenReceivable, onLoadCategoryDetails, onOverlayChange, onMoveEntry, todayJump = 0 }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const hintId = useId();
  const calendarRef = useRef(null);
  const suppressClick = useRef(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingTransaction, setViewingTransaction] = useState(null);
  const [filters, setFilters] = useState({income: true, expense: true, planned: true});
  const [heatmap, setHeatmap] = useState(true);
  const [desktop, setDesktop] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dropDate, setDropDate] = useState(null);
  const [moving, setMoving] = useState(false);
  const [moveFeedback, setMoveFeedback] = useState(null);
  const [optimistic, setOptimistic] = useState(null);
  const visibleDays = optimistic?.source === days ? optimistic.moved : days;
  const monthDays = useMemo(() => calendarDays(visibleDays, year, month, openingBalance), [visibleDays, year, month, openingBalance]);
  const byDate = useMemo(() => new Map(monthDays.map(day => [day.date, day])), [monthDays]);
  const selectedDay = byDate.get(selectedDate);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const weekCount = Math.ceil((firstWeekday + monthDays.length) / 7);
  const maxExpense = Math.max(0, ...monthDays.map(day => day.totals.expense));
  const totals = monthDays.reduce((result, day) => ({income: result.income + day.totals.income, expense: result.expense + day.totals.expense}), {income: 0, expense: 0});
  const lowestDay = monthDays.reduce((lowest, day) => day.balance < lowest.balance ? day : lowest, monthDays[0]);
  const today = todayIsoDate();
  const dateLabel = date => new Intl.DateTimeFormat(language, {day: "numeric", month: "long", year: "numeric"}).format(new Date(`${date}T12:00:00`));
  const signedMoney = value => moneySign(value) + formatMoney(Math.abs(value), language);
  const valueClass = value => value < 0 ? "expense" : value > 0 ? "income" : "neutral";

  useEffect(() => {
    setSelectedDate(null); setViewingTransaction(null); setOptimistic(null); setDragging(null); setDropDate(null); setMoveFeedback(null);
  }, [year, month]);
  useEffect(() => {
    onOverlayChange?.(Boolean(selectedDay || viewingTransaction));
    return () => onOverlayChange?.(false);
  }, [selectedDay, viewingTransaction, onOverlayChange]);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia("(min-width: 941px) and (pointer: fine)");
    const update = () => setDesktop(media.matches);
    update(); media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    if (!todayJump) return;
    const frame = requestAnimationFrame(() => calendarRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({block: "center", inline: "center", behavior: "smooth"}));
    return () => cancelAnimationFrame(frame);
  }, [todayJump]);
  useEffect(() => {
    if (!dragging) return undefined;
    const cancel = event => { if (event.key === "Escape") { event.preventDefault(); setDragging(null); setDropDate(null); } };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [dragging]);

  const openEntry = entry => {
    if (suppressClick.current) return;
    setSelectedDate(null);
    if (entry.kind === "receivable") onOpenReceivable?.(entry.item);
    else setViewingTransaction(entry.item);
  };
  const addEntry = date => { setSelectedDate(null); onAdd?.(date); };
  const endDrag = () => {
    setDragging(null); setDropDate(null);
    window.setTimeout(() => { suppressClick.current = false; }, 120);
  };
  const startDrag = (event, entry, date) => {
    if (!desktop || moving || !onMoveEntry || (entry.kind !== "receivable" && !entry.item.invoice_id)) {event.preventDefault(); return;}
    suppressClick.current = true;
    event.dataTransfer?.setData("text/plain", entry.key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setDragging({entry, date}); setMoveFeedback(null);
  };
  const dropOnDay = async (event, date) => {
    if (!dragging || moving) return;
    event.preventDefault();
    const {entry, date: from} = dragging;
    endDrag();
    if (date === from) return;
    setOptimistic({source: days, moved: moveCalendarEntry(visibleDays, entry, from, date)});
    setMoving(true); setMoveFeedback(null);
    try {
      await onMoveEntry(entry, date);
      setMoveFeedback({error: false, text: copy("Data atualizada", "Date updated")});
    } catch {
      setOptimistic(null);
      setMoveFeedback({error: true, text: copy("Não foi possível mover. A data original foi restaurada.", "Unable to move. The original date was restored.")});
    } finally { setMoving(false); }
  };

  const renderDay = (day, weekday, week) => {
    if (!day) return <div className="month-calendar-day is-outside" role="cell" key={weekday} aria-hidden="true" />;
    const entries = entriesForDay(day, invoices).filter(entry => filters[describeEntry(entry, language).kind]);
    const expenseTint = heatmap && day.totals.expense > 0 && maxExpense > 0 ? `${8 + 7 * day.totals.expense / maxExpense}%` : "0%";
    return <div role="cell" aria-colindex={weekday + 1} aria-rowindex={week + 2} key={day.date} data-day={day.date} aria-label={dateLabel(day.date)} aria-current={day.date === today ? "date" : undefined}
      className={`month-calendar-day${day.date === today ? " is-today" : day.date < today ? " is-past" : ""}${dropDate === day.date ? " is-drop-target" : ""}`}
      style={{"--calendar-heat": expenseTint}}
      onDragOver={event => {if (dragging && !moving) {event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; setDropDate(day.date);}}}
      onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget)) setDropDate(null);}}
      onDrop={event => dropOnDay(event, day.date)}>
      <div className="month-calendar-day-head"><button className="month-calendar-day-number" type="button" onClick={() => setSelectedDate(day.date)} aria-label={`${copy("Abrir dia", "Open day")} ${dateLabel(day.date)}`}>{Number(day.date.slice(-2))}</button>
        {day.date === today && <small>{copy("Hoje", "Today")}</small>}</div>
      <div className="month-calendar-entries">{entries.slice(0, PREVIEW_LIMIT).map(entry => <CalendarEntry key={entry.key} entry={entry} onOpen={openEntry}
        draggable={desktop && !moving && Boolean(onMoveEntry) && (entry.kind === "receivable" || Boolean(entry.item.invoice_id))}
        onDragStart={event => startDrag(event, entry, day.date)} onDragEnd={endDrag} />)}</div>
      <div className="month-calendar-more-slot">{entries.length > PREVIEW_LIMIT && <button className="month-calendar-see-all" type="button" onClick={() => setSelectedDate(day.date)} aria-label={`${copy("Abrir todos os lançamentos de", "Open all entries on")} ${dateLabel(day.date)}`}>
        +{entries.length - PREVIEW_LIMIT} {copy("mais", "more")}</button>}</div>
      <div className="month-calendar-balance"><strong title={copy("Saldo do dia", "Day balance")} className={valueClass(day.balance)}>{formatMoney(day.balance, language)}</strong>
        {day.variation !== 0 && <small className={valueClass(day.variation)} aria-label={`${copy("Variação do dia", "Day change")}: ${signedMoney(day.variation)}`}>{signedMoney(day.variation)}</small>}</div>
    </div>;
  };

  return <div className="month-calendar-view" aria-busy={moving}>
    <div className="month-calendar-month-summary">
      <div><small>{copy("Total de ganhos", "Total income")}</small><strong className="income">{formatMoney(summary?.total_income ?? totals.income, language)}</strong></div>
      <div><small>{copy("Total de gastos", "Total expenses")}</small><strong className="expense">{formatMoney(summary?.total_expenses ?? totals.expense, language)}</strong></div>
      <div><small>{copy("Saldo final projetado", "Projected closing balance")}</small><strong className={valueClass(Number(summary?.projected_closing ?? monthDays.at(-1).projected_balance ?? monthDays.at(-1).balance))}>{formatMoney(summary?.projected_closing ?? monthDays.at(-1).projected_balance ?? monthDays.at(-1).balance, language)}</strong></div>
      <button type="button" onClick={() => setSelectedDate(lowestDay.date)} aria-label={`${copy("Dia de menor saldo", "Lowest balance day")}: ${dateLabel(lowestDay.date)}`}><small>{copy("Dia de menor saldo", "Lowest balance day")}</small><strong className={valueClass(lowestDay.balance)}>{formatMoney(lowestDay.balance, language)}</strong><span>{dateLabel(lowestDay.date)}</span></button>
    </div>
    <div className="month-calendar-toolbar">
      <div className="month-calendar-legend" role="group" aria-label={copy("Filtrar lançamentos", "Filter entries")}>
        {[["income", ArrowUpRight, copy("Ganhos", "Income")], ["expense", ArrowDownLeft, copy("Gastos/faturas", "Expenses/invoices")], ["planned", Coins, copy("Previstos", "Expected")]].map(([kind, Icon, label]) =>
          <button type="button" key={kind} className={kind} aria-pressed={filters[kind]} onClick={() => setFilters(current => ({...current, [kind]: !current[kind]}))}><Icon size={14} />{label}</button>)}
      </div>
      <button className="month-calendar-heat-toggle" type="button" aria-pressed={heatmap} onClick={() => setHeatmap(value => !value)}><Flame size={15} />{copy("Mapa de gastos", "Expense heatmap")}</button>
    </div>
    <div className="month-calendar-move-feedback" role={moveFeedback?.error ? "alert" : "status"} aria-live="polite">{moving ? copy("Salvando nova data…", "Saving new date…") : moveFeedback?.text}</div>
    <p id={hintId} className="month-calendar-scroll-hint"><MoveHorizontal size={15} />{copy("Deslize para ver toda a semana.", "Swipe to see the whole week.")}</p>
    <div ref={calendarRef} className="month-calendar-scroll" role="region" aria-label={copy("Calendário mensal", "Monthly calendar")} aria-describedby={hintId} tabIndex={0}>
      <div className="month-calendar-grid" role="table" aria-label={formatMonthLabel(year, month, language)} aria-colcount={8} aria-rowcount={weekCount + 1}>
        <div className="month-calendar-weekdays" role="row">{Array.from({length: 7}, (_, index) => <span role="columnheader" key={index}>{new Intl.DateTimeFormat(language, {weekday: "short"}).format(new Date(2026, 2, 1 + index)).replace(".", "")}</span>)}<span className="month-calendar-week-column-heading" role="columnheader">{copy("Líquido", "Net")}</span></div>
        {Array.from({length: weekCount}, (_, week) => {
          const weekDays = Array.from({length: 7}, (_, weekday) => monthDays[week * 7 + weekday - firstWeekday]);
          const net = weekDays.reduce((sum, day) => sum + (day ? Math.round((day.totals.income - day.totals.expense) * 100) : 0), 0) / 100;
          return <div className="month-calendar-week" role="row" key={week}>
            {weekDays.map((day, weekday) => renderDay(day, weekday, week))}
            <div className="month-calendar-week-total" role="cell" aria-colindex={8} aria-label={`${copy("Líquido da semana", "Week net")} ${week + 1}`}><div><small>{copy("Semana", "Week")} {week + 1}</small><strong className={valueClass(net)}>{signedMoney(net)}</strong></div></div>
          </div>;
        })}
      </div>
    </div>
    {selectedDay && <DayEntriesModal day={selectedDay} invoices={invoices} onClose={() => setSelectedDate(null)} onOpen={openEntry} onAdd={addEntry} />}
    {viewingTransaction && <EntryDetailsModal item={viewingTransaction} invoice={invoices.find(invoice => invoice.id === viewingTransaction.invoice_id)} onLoadCategoryDetails={onLoadCategoryDetails} onClose={() => setViewingTransaction(null)} onEdit={() => {const item = viewingTransaction; setViewingTransaction(null); onEdit?.(item);}} />}
  </div>;
}
