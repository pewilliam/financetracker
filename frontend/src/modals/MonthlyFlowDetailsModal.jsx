import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { CreditCard, ReceiptText, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
import { isInvoiceTransaction } from "../app/helpers.js";
import { formatMoney, formatMonthLabel } from "../utils/format.js";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDayHeading(dateString, language) {
  const formatted = new Intl.DateTimeFormat(language, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${dateString}T00:00:00`));
  return `${formatted.charAt(0).toLocaleUpperCase(language)}${formatted.slice(1)}`;
}

function formatDayChip(dateString, language) {
  const date = new Date(`${dateString}T00:00:00`);
  const weekday = new Intl.DateTimeFormat(language, { weekday: "short" })
    .format(date)
    .replace(".", "")
    .slice(0, 3)
    .toLocaleUpperCase(language);
  return { day: String(date.getDate()).padStart(2, "0"), weekday };
}

export default function MonthlyFlowDetailsModal({ days = [], type, total, language, year, month, onClose }) {
  const closeButtonRef = useRef(null);
  const income = type === "income";
  const accent = income ? "var(--income)" : "var(--expense)";
  const FlowIcon = income ? TrendingUp : TrendingDown;
  const text = language === "en-US"
    ? income
      ? { eyebrow: "Monthly income", title: "Income by day", total: "Month total", entry: "entry", entries: "entries", activeDay: "day with income", activeDays: "days with income", empty: "No income was recorded this month.", noDescription: "No description", uncategorized: "Uncategorized", invoice: "Invoice" }
      : { eyebrow: "Monthly expenses", title: "Expenses by day", total: "Month total", entry: "entry", entries: "entries", activeDay: "day with expenses", activeDays: "days with expenses", empty: "No expenses were recorded this month.", noDescription: "No description", uncategorized: "Uncategorized", invoice: "Invoice" }
    : income
      ? { eyebrow: "Ganhos do mês", title: "Ganhos por dia", total: "Total do mês", entry: "lançamento", entries: "lançamentos", activeDay: "dia com ganhos", activeDays: "dias com ganhos", empty: "Nenhum ganho foi registrado neste mês.", noDescription: "Sem descrição", uncategorized: "Sem categoria", invoice: "Fatura" }
      : { eyebrow: "Gastos do mês", title: "Gastos por dia", total: "Total do mês", entry: "lançamento", entries: "lançamentos", activeDay: "dia com gastos", activeDays: "dias com gastos", empty: "Nenhum gasto foi registrado neste mês.", noDescription: "Sem descrição", uncategorized: "Sem categoria", invoice: "Fatura" };

  const groups = useMemo(() => days
    .map((day) => {
      const transactions = (day.transactions || []).filter((transaction) => transaction.type === type);
      return {
        date: day.date,
        transactions,
        total: transactions.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0),
      };
    })
    .filter((day) => day.transactions.length), [days, type]);
  const transactionCount = groups.reduce((count, day) => count + day.transactions.length, 0);
  const firstDate = groups[0]?.date || days[0]?.date;
  const resolvedYear = Number(year || String(firstDate || "").slice(0, 4)) || new Date().getFullYear();
  const resolvedMonth = Number(month || String(firstDate || "").slice(5, 7)) || new Date().getMonth() + 1;
  const monthLabel = formatMonthLabel(resolvedYear, resolvedMonth, language);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-layer monthly-flow-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close monthly details" : "Fechar detalhes do mês"} />
      <section className={`modal-card monthly-flow-modal ${income ? "is-income" : "is-expense"}`} style={{ "--flow-accent": accent }} role="dialog" aria-modal="true" aria-labelledby="monthly-flow-title">
        <header className="monthly-flow-header">
          <i><FlowIcon size={20} /></i>
          <div><p className="eyebrow">{text.eyebrow} · {monthLabel}</p><h2 id="monthly-flow-title">{text.title}</h2></div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close" : "Fechar"}><X size={18} /></button>
        </header>

        <div className="monthly-flow-body">
          <div className="monthly-flow-summary">
            <div><small>{text.total}</small><strong>{formatMoney(total, language)}</strong><span>{monthLabel}</span></div>
            <div><small>{language === "en-US" ? "Activity" : "Movimentação"}</small><strong>{transactionCount}</strong><span>{text.entries}</span></div>
            <div><small>{language === "en-US" ? "Distribution" : "Distribuição"}</small><strong>{groups.length}</strong><span>{groups.length === 1 ? text.activeDay : text.activeDays}</span></div>
          </div>

          <div className="monthly-flow-list">
            {groups.length ? groups.map((day) => {
              const dayHeading = formatDayHeading(day.date, language);
              const dayChip = formatDayChip(day.date, language);
              return (
                <section className="monthly-flow-day" key={day.date} aria-labelledby={`monthly-flow-day-${day.date}`}>
                  <header className="monthly-flow-day-header">
                    <span className="monthly-flow-day-chip" aria-hidden="true"><strong>{dayChip.day}</strong><small>{dayChip.weekday}</small></span>
                    <h3 id={`monthly-flow-day-${day.date}`}>{dayHeading.toLocaleUpperCase(language)}</h3>
                    <i className="monthly-flow-day-rule" aria-hidden="true" />
                    <p>{day.transactions.length} {day.transactions.length === 1 ? text.entry : text.entries}<em>·</em>{formatMoney(day.total, language)}</p>
                  </header>
                  <div className="monthly-flow-day-entries">
                    {day.transactions.map((transaction) => {
                      const invoice = isInvoiceTransaction(transaction);
                      const EntryIcon = invoice ? CreditCard : ReceiptText;
                      const categoryName = transaction.categories?.length
                        ? transaction.categories.map((category) => category.name).join(" + ")
                        : transaction.category?.name;
                      const context = invoice ? text.invoice : ([categoryName, transaction.wallet?.name].filter(Boolean).join(" · ") || text.uncategorized);
                      const description = transaction.description || text.noDescription;
                      return <article className="monthly-flow-entry" key={transaction.id}><i><EntryIcon size={16} /></i><span><strong>{description}</strong><small>{context}</small></span><strong>{formatMoney(transaction.amount, language)}</strong></article>;
                    })}
                  </div>
                </section>
              );
            }) : (
              <div className="monthly-flow-empty"><WalletCards size={24} /><strong>{text.empty}</strong><span>{monthLabel}</span></div>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
