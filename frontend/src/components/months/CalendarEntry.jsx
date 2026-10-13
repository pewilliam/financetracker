import { ArrowDownLeft, ArrowUpRight, Coins, Receipt } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";
import { describeEntry } from "./calendarEntries.js";

export default function CalendarEntry({ entry, onOpen, detailed = false }) {
  const { language } = useI18n();
  const info = describeEntry(entry, language);
  const Icon = info.invoice ? Receipt : info.kind === "planned" ? Coins : info.kind === "income" ? ArrowUpRight : ArrowDownLeft;
  return <button type="button" className={`month-calendar-entry ${info.kind}${detailed ? " is-detailed" : ""}`} onClick={() => onOpen(entry)}
    aria-label={`${language === "en-US" ? "View details" : "Ver detalhes"}: ${info.label} · ${info.title} · ${formatMoney(info.amount, language)}`} title={`${info.title} · ${info.metadata} · ${formatMoney(info.amount, language)}`}>
    <i aria-hidden="true"><Icon size={detailed ? 18 : 13} /></i>
    <span className="month-calendar-entry-copy"><strong>{info.title}</strong>{detailed && <small>{info.metadata}</small>}</span>
    <span className="month-calendar-entry-amount">{info.kind === "income" ? "+ " : info.kind === "expense" ? "− " : ""}{formatMoney(info.amount, language)}</span>
  </button>;
}
