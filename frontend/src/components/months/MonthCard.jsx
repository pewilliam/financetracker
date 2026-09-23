import { ArrowRight, CalendarPlus, CircleDollarSign, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";
import AnimatedMoney from "../common/AnimatedMoney.jsx";
import { formatTransactionCount, getMonthPeriod } from "../../app/helpers.js";

export default function MonthCard({ item, onView, onQuickAdd, tourTarget, featured = false }) {
  const { language } = useI18n();
  const period = getMonthPeriod(item);
  const isCurrent = period === "current";
  const isFuture = period === "future";
  const isPast = period === "past";
  const priorPlanned = isPast ? 0 : Number(item.prior_planned_receivables_total || 0);
  const plannedReceivables = isPast ? 0 : Number(item.planned_receivables_total || 0);
  const inMonthReceivables = Math.max(0, plannedReceivables - priorPlanned);
  const projectedClosing = Number(item.closing_balance || 0) + plannedReceivables;
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
    receivables: `Includes ${formatMoney(plannedReceivables, language)} in receivables`
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
    receivables: `Inclui ${formatMoney(plannedReceivables, language)} em recebíveis`
  };

  const receivableNote = plannedReceivables > 0 ? (
    <p className="month-receivable-note"><CircleDollarSign size={13} /> {labelText.receivables}</p>
  ) : null;

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
      <div className="month-balance-metric projected">
        <span>{labelText.projectedClosing}</span>
        <AnimatedMoney value={projectedClosing} />
      </div>
      {receivableNote}
    </div>
  ) : isFuture ? (
    <div className="month-card-balance featured-balance">
      <div className="month-balance-metric">
        <span>{labelText.startedWith}</span>
        <AnimatedMoney value={openingValue} />
      </div>
      <div className="month-balance-metric projected">
        <span>{labelText.projectedClosing}</span>
        <AnimatedMoney value={projectedClosing} />
      </div>
      {receivableNote}
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
