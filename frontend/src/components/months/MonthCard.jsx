import { ArrowRight, CalendarPlus, ChevronRight, CircleDollarSign, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";
import AnimatedMoney from "../common/AnimatedMoney.jsx";
import { formatTransactionCount, getMonthPeriod } from "../../app/helpers.js";

export default function MonthCard({ item, onView, onQuickAdd, onOpenProjection, projectionLoading = false, tourTarget, featured = false }) {
  const { language } = useI18n();
  const period = getMonthPeriod(item);
  const isCurrent = period === "current";
  const isFuture = period === "future";
  const isPast = period === "past";
  const priorPlanned = isPast ? 0 : Number(item.prior_planned_receivables_total || 0);
  const plannedReceivables = isPast ? 0 : Number(item.planned_receivables_total || 0);
  const inMonthReceivables = Math.max(0, plannedReceivables - priorPlanned);
  const projectedClosing = Number(
    item.projected_closing
      ?? (Number(item.closing_balance || 0) + plannedReceivables - Number(item.open_invoices_projected_total || 0))
  );
  const invoiceProjection = isPast ? 0 : Number(item.open_invoices_projected_total || 0);
  const openingValue = Number(item.opening_balance || 0) + (isFuture ? priorPlanned : 0);
  const incomeValue = Number(item.total_income || 0) + (isFuture ? inMonthReceivables : 0);
  const expenseValue = Number(item.total_expenses || 0);
  const net = incomeValue - expenseValue;
  const totalMovement = expenseValue + incomeValue;
  const incomeShare = totalMovement ? (incomeValue / totalMovement) * 100 : 50;
  const expenseShare = totalMovement ? 100 - incomeShare : 50;
  const movementLabel = net > 0 ? "+" : net < 0 ? "−" : "";
  const movementClass = net > 0 ? "money-income" : net < 0 ? "money-expense" : "money-neutral";
  const monthName = new Intl.DateTimeFormat(language, { month: "long" }).format(new Date(Number(item.year), Number(item.month) - 1, 1));
  const normalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const labelText = language === "en-US" ? {
    expenses: isFuture ? "Projected expenses" : "Expenses",
    income: isFuture ? "Projected income" : "Income",
    closing: isFuture ? "Projection" : "Closing balance",
    current: "Current balance",
    currentBadge: "CURRENT MONTH",
    futureBadge: "FUTURE",
    count: `${Number(item.transaction_count || 0)} ${Number(item.transaction_count || 0) === 1 ? "entry" : "entries"}${isFuture ? " expected" : ""}`,
    result: isFuture ? "Projected result" : "Month result",
    startedWith: "Opening balance",
    projectedClosing: "Projected closing",
    quickAdd: "Add entry",
    view: "Open month",
    flow: "Month cash flow",
    receivablesImpact: `To receive: +${formatMoney(plannedReceivables, language)}`,
    invoicesImpact: `Projected invoices: −${formatMoney(invoiceProjection, language)}`,
    viewProjection: "View projection details"
  } : {
    expenses: isFuture ? "Gastos previstos" : "Gastos",
    income: isFuture ? "Ganhos previstos" : "Ganhos",
    closing: isFuture ? "Projeção" : "Saldo final",
    current: "Saldo atual",
    currentBadge: "MÊS ATUAL",
    futureBadge: "FUTURO",
    count: formatTransactionCount(item.transaction_count, isFuture),
    result: isFuture ? "Resultado previsto" : "Resultado do mês",
    startedWith: "Saldo inicial",
    projectedClosing: "Fechamento previsto",
    quickAdd: "Adicionar",
    view: "Abrir mês",
    flow: "Fluxo do mês",
    receivablesImpact: `A receber: +${formatMoney(plannedReceivables, language)}`,
    invoicesImpact: `Faturas previstas: −${formatMoney(invoiceProjection, language)}`,
    viewProjection: "Ver detalhes da projeção"
  };

  const hasReceivables = plannedReceivables > 0;
  const hasInvoiceProjection = invoiceProjection > 0;
  const projectionNote = !isPast && (hasReceivables || hasInvoiceProjection) ? (
    <p className={`month-receivable-note month-projection-note ${hasReceivables && hasInvoiceProjection ? "mixed" : hasInvoiceProjection ? "negative" : "positive"}`}>
      <CircleDollarSign size={14} />
      {hasReceivables && <span className="positive">{labelText.receivablesImpact}</span>}
      {hasReceivables && hasInvoiceProjection && <i aria-hidden="true">·</i>}
      {hasInvoiceProjection && <span className="negative">{labelText.invoicesImpact}</span>}
    </p>
  ) : null;

  const projectedMetric = (
    <button
      className="month-balance-metric projected is-clickable"
      type="button"
      onClick={onOpenProjection}
      disabled={projectionLoading}
      aria-busy={projectionLoading}
      aria-label={`${labelText.viewProjection}: ${normalizedMonthName}, ${formatMoney(projectedClosing, language)}`}
      title={labelText.viewProjection}
    >
      <span>{labelText.projectedClosing}{projectionLoading ? <Loader2 className="spin" size={12} /> : <ChevronRight size={12} />}</span>
      <AnimatedMoney value={projectedClosing} />
    </button>
  );

  const balanceBlock = featured && isCurrent ? (
    <div className="month-card-balance featured-balance featured-balance-triple">
      <div className="month-balance-metric">
        <span>{labelText.startedWith}</span>
        <AnimatedMoney value={openingValue} />
      </div>
      <div className="month-balance-metric primary">
        <span>{labelText.current}</span>
        <AnimatedMoney value={item.current_balance} />
      </div>
      {projectedMetric}
      {projectionNote}
    </div>
  ) : isFuture ? (
    <div className="month-card-balance featured-balance">
      <div className="month-balance-metric">
        <span>{labelText.startedWith}</span>
        <AnimatedMoney value={openingValue} />
      </div>
      {projectedMetric}
      {projectionNote}
    </div>
  ) : isPast ? (
    <div className="month-card-balance featured-balance">
      <div className="month-balance-metric">
        <span>{labelText.startedWith}</span>
        <AnimatedMoney value={openingValue} />
      </div>
      <div className="month-balance-metric primary">
        <span>{labelText.closing}</span>
        <AnimatedMoney value={projectedClosing} />
      </div>
    </div>
  ) : (
    <div className="month-card-balance">
      <span>{labelText.current}</span>
      <AnimatedMoney value={item.current_balance} />
      <small>{labelText.startedWith} {formatMoney(item.opening_balance, language)}</small>
    </div>
  );

  return (
    <article className={`month-card ${period}${featured ? " featured" : ""}`} data-months-tour={tourTarget}>
      <header className="month-card-head">
        <div className="month-card-title">
          <h3>{normalizedMonthName}</h3>
          {isCurrent && <span className="month-badge current">{labelText.currentBadge}</span>}
          {isFuture && <span className="month-badge future">{labelText.futureBadge}</span>}
        </div>
        <button className="month-card-open" type="button" onClick={onView} aria-label={`${labelText.view}: ${item.label}`} title={labelText.view}>
          <ArrowRight size={18} />
        </button>
      </header>
      <div className="month-card-body">
        {balanceBlock}

        <div className="month-flow" aria-label={labelText.flow}>
          <div className="month-flow-values">
            <div className="month-flow-metric income">
              <span><TrendingUp size={14} /> {labelText.income}</span>
              <AnimatedMoney value={incomeValue} />
            </div>
            <div className="month-flow-metric expense">
              <span><TrendingDown size={14} /> {labelText.expenses}</span>
              <AnimatedMoney value={expenseValue} />
            </div>
          </div>
          <div className="month-flow-track" aria-hidden="true">
            <i className="income" style={{ width: `${incomeShare}%` }} />
            <i className="expense" style={{ width: `${expenseShare}%` }} />
          </div>
        </div>

        <div className="month-result">
          <span>{labelText.result}</span>
          <strong className={movementClass}>
            {net > 0 ? <TrendingUp size={16} /> : net < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
            {movementLabel}{formatMoney(Math.abs(net), language)}
          </strong>
        </div>
      </div>
      <footer className="month-card-footer">
        <span className="month-card-count">{labelText.count}</span>
        <button className="month-quick-add" type="button" onClick={onQuickAdd}><CalendarPlus size={15} /> {labelText.quickAdd}</button>
      </footer>
    </article>
  );
}
