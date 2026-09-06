import { ArrowRight, CalendarPlus, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";
import AnimatedMoney from "../common/AnimatedMoney.jsx";
import { formatTransactionCount, getMonthPeriod } from "../../app/helpers.js";

export default function MonthCard({ item, onView, onQuickAdd, tourTarget }) {
  const { language } = useI18n();
  const period = getMonthPeriod(item);
  const isCurrent = period === "current";
  const isFuture = period === "future";
  const net = Number(item.total_income || 0) - Number(item.total_expenses || 0);
  const totalMovement = Number(item.total_expenses || 0) + Number(item.total_income || 0);
  const incomeShare = totalMovement ? (Number(item.total_income || 0) / totalMovement) * 100 : 50;
  const expenseShare = totalMovement ? 100 - incomeShare : 50;
  const movementLabel = net > 0 ? "+" : net < 0 ? "−" : "";
  const movementClass = net > 0 ? "money-income" : net < 0 ? "money-expense" : "money-neutral";
  const monthName = new Intl.DateTimeFormat(language, { month: "long" }).format(new Date(Number(item.year), Number(item.month) - 1, 1));
  const normalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const displayedBalance = isCurrent ? item.current_balance : item.closing_balance;
  const labelText = language === "en-US" ? {
    expenses: isFuture ? "Projected expenses" : "Expenses",
    income: isFuture ? "Projected income" : "Income",
    closing: isFuture ? "Projection" : isCurrent ? "Current balance" : "Closing",
    currentBadge: "CURRENT MONTH",
    futureBadge: "FUTURE",
    count: `${Number(item.transaction_count || 0)} ${Number(item.transaction_count || 0) === 1 ? "entry" : "entries"}${isFuture ? " expected" : ""}`,
    result: isFuture ? "Projected result" : "Month result",
    startedWith: "Started with",
    projectedClosing: "Projected closing",
    quickAdd: "Add entry",
    view: "Open month",
    flow: "Month cash flow"
  } : {
    expenses: isFuture ? "Gastos previstos" : "Gastos",
    income: isFuture ? "Ganhos previstos" : "Ganhos",
    closing: isFuture ? "Projeção" : isCurrent ? "Saldo atual" : "Fechamento",
    currentBadge: "MÊS ATUAL",
    futureBadge: "FUTURO",
    count: formatTransactionCount(item.transaction_count, isFuture),
    result: isFuture ? "Resultado previsto" : "Resultado do mês",
    startedWith: "Começou com",
    projectedClosing: "Fechamento previsto",
    quickAdd: "Adicionar",
    view: "Abrir mês",
    flow: "Fluxo do mês"
  };

  return (
    <article className={`month-card ${period}`} data-months-tour={tourTarget}>
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
        <div className="month-card-balance">
          <span>{labelText.closing}</span>
          <AnimatedMoney value={displayedBalance} />
          <small>{isCurrent ? labelText.projectedClosing : labelText.startedWith} {formatMoney(isCurrent ? item.closing_balance : item.opening_balance, language)}</small>
        </div>

        <div className="month-flow" aria-label={labelText.flow}>
          <div className="month-flow-values">
            <div className="month-flow-metric income">
              <span><TrendingUp size={14} /> {labelText.income}</span>
              <AnimatedMoney value={item.total_income} />
            </div>
            <div className="month-flow-metric expense">
              <span><TrendingDown size={14} /> {labelText.expenses}</span>
              <AnimatedMoney value={item.total_expenses} />
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


