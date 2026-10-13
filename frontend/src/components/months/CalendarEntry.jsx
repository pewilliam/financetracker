import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Coins, Receipt } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";
import { describeEntry } from "./calendarEntries.js";

export default function CalendarEntry({ entry, onOpen, detailed = false, draggable = false, onDragStart, onDragEnd }) {
  const { language } = useI18n();
  const info = describeEntry(entry, language);
  const Icon = info.invoice ? Receipt : info.kind === "planned" ? Coins : info.kind === "income" ? ArrowUpRight : ArrowDownLeft;
  const StatusIcon = info.status === "paid" ? CheckCircle2 : Clock3;
  return <button type="button" className={`month-calendar-entry ${info.kind}${info.invoice ? " is-invoice" : ""}${detailed ? " is-detailed" : ""}`} onClick={() => onOpen(entry)}
    draggable={draggable || undefined} onDragStart={onDragStart} onDragEnd={onDragEnd} data-entry-key={entry.key}
    aria-label={`${language === "en-US" ? "View details" : "Ver detalhes"}: ${info.label} · ${info.title} · ${formatMoney(info.amount, language)}${info.statusLabel ? ` · ${info.statusLabel}` : ""}`} title={`${info.title} · ${info.metadata} · ${formatMoney(info.amount, language)}${info.statusLabel ? ` · ${info.statusLabel}` : ""}`}>
    <i aria-hidden="true"><Icon size={detailed ? 18 : 13} /></i>
    <span className="month-calendar-entry-copy"><strong>{info.title}</strong>{detailed && <small>{info.metadata}</small>}</span>
    <span className="month-calendar-entry-amount">{info.kind === "income" ? "+ " : info.kind === "expense" ? "− " : ""}{formatMoney(info.amount, language)}</span>
    {info.status && <span className={`month-calendar-entry-status ${info.status}`} role="img" aria-label={info.statusLabel}><StatusIcon size={13} /></span>}
  </button>;
}
