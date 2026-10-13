import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Plus, X } from "lucide-react";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";
import CalendarEntry from "../components/months/CalendarEntry.jsx";
import { entriesForDay, describeEntry } from "../components/months/calendarEntries.js";
import "./financeSheets.css";

export default function DayEntriesModal({ day, onClose, onOpen, onAdd }) {
  const { language } = useI18n();
  const english = language === "en-US";
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useModalLifecycle({ onClose, initialFocusRef: closeRef });
  useEffect(() => {
    const trigger = document.activeElement;
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  const entries = entriesForDay(day);
  const totals = entries.reduce((result, entry) => {
    const info = describeEntry(entry, language);
    result[info.kind] += Number(info.amount || 0);
    return result;
  }, { income: 0, expense: 0, planned: 0 });
  const date = new Date(`${day.date.slice(0, 10)}T12:00:00`);
  const fullDate = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  const trapFocus = event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(panelRef.current.querySelectorAll('button:not(:disabled), [tabindex="0"]'));
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="finance-sheet-layer month-day-modal-layer">
    <button className="finance-sheet-backdrop" type="button" tabIndex={-1} onClick={onClose} aria-label={english ? "Close day entries" : "Fechar lançamentos do dia"} />
    <section ref={panelRef} className="finance-sheet month-day-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapFocus}>
      <header className="finance-sheet-header">
        <i className="finance-sheet-heading-icon"><CalendarDays size={20} /></i>
        <div className="finance-sheet-heading"><small>{fullDate}</small><h2 id={titleId}>{english ? "Day entries" : "Lançamentos do dia"}</h2><p>{entries.length} {english ? (entries.length === 1 ? "entry" : "entries") : (entries.length === 1 ? "lançamento" : "lançamentos")}</p></div>
        <button ref={closeRef} className="finance-sheet-close" type="button" onClick={onClose} aria-label={english ? "Close" : "Fechar"}><X size={18} /></button>
      </header>
      <div className="finance-sheet-summary month-day-summary">
        <div><small>{english ? "Income" : "Ganhos"}</small><strong className="money-income">{formatMoney(totals.income, language)}</strong></div>
        <div><small>{english ? "Expenses" : "Gastos"}</small><strong className="money-expense">{formatMoney(totals.expense, language)}</strong></div>
        <div><small>{english ? "Expected" : "Previstos"}</small><strong className="money-planned">{formatMoney(totals.planned, language)}</strong></div>
      </div>
      <div className="finance-sheet-scroll"><div className="finance-sheet-body month-day-entries">
        {entries.map(entry => <CalendarEntry key={entry.key} entry={entry} detailed onOpen={onOpen} />)}
      </div></div>
      <footer className="month-day-modal-footer"><button className="btn btn-ghost" type="button" onClick={onClose}>{english ? "Close" : "Fechar"}</button>
        <button className="btn btn-primary" type="button" onClick={() => onAdd(day.date)}><Plus size={16} />{english ? "Add entry" : "Adicionar lançamento"}</button></footer>
    </section>
  </div>, document.body);
}
