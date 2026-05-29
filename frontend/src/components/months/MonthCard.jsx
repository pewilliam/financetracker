import { Plus } from "lucide-react";
import { useI18n } from "../../i18n/index.ts";
import { formatMoney } from "../../utils/format.js";
import AnimatedMoney from "../common/AnimatedMoney.jsx";
import { formatTransactionCount, getMonthPeriod } from "../../app/helpers.js";

export default function MonthCard({ item, onView, onQuickAdd }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const period = getMonthPeriod(item);
  const isCurrent = period === "current";
  const isFuture = period === "future";
  const net = Number(item.total_income || 0) - Number(item.total_expenses || 0);
  const closingDelta = Number(item.closing_balance || 0) - Number(item.opening_balance || 0);
  const settledTone = period === "past" ? (closingDelta > 0 ? "settled-positive" : closingDelta < 0 ? "settled-negative" : "settled-neutral") : "";
  const maxMovement = Math.max(Number(item.total_expenses || 0), Number(item.total_income || 0), 1);
  const expenseWidth = Math.min((Number(item.total_expenses || 0) / maxMovement) * 100, 100);
  const incomeWidth = Math.min((Number(item.total_income || 0) / maxMovement) * 100, 100);
  const movementLabel = net > 0 ? "+" : net < 0 ? "-" : "";
  const movementClass = net > 0 ? "money-income" : net < 0 ? "money-expense" : "money-neutral";
  const labelText = language === "en-US" ? {
    expenses: isFuture ? "Projected expenses" : "Expenses",
    income: isFuture ? "Projected income" : "Income",
    closing: isFuture ? "Projection" : isCurrent ? "Projected closing" : "Closing",
    currentBadge: "CURRENT MONTH",
    futureBadge: "FUTURE",
    count: `${Number(item.transaction_count || 0)} ${Number(item.transaction_count || 0) === 1 ? "entry" : "entries"}${isFuture ? " expected" : ""}`,
    quickAdd: "Quick add entry"
  } : {
    expenses: isFuture ? "Gastos previstos" : "Gastos",
    income: isFuture ? "Ganhos previstos" : "Ganhos",
    closing: isFuture ? "Projeção" : isCurrent ? "Fechamento projetado" : "Fechamento",
    currentBadge: "MÊS ATUAL",
    futureBadge: "FUTURO",
    count: formatTransactionCount(item.transaction_count, isFuture),
    quickAdd: "Adicionar lançamento rápido"
  };

  return (
    <article className={`month-card ${period} ${settledTone}`}>
      <header className="month-card-head">
        <div className="month-card-title">
          <h3>{item.label}</h3>
          {isCurrent && <span className="month-badge current">{labelText.currentBadge}</span>}
          {isFuture && <span className="month-badge future">{labelText.futureBadge}</span>}
        </div>
        <button className="month-card-link" onClick={onView}>{tt("actions.details", "Ver")} →</button>
      </header>
      <div className="month-card-body">
        <div className="month-balance-grid">
          <div className="metric-block">
            <span>{tt("monthlyTable.openingBalance", "Saldo inicial")}</span>
            <AnimatedMoney value={item.opening_balance} />
          </div>
          <div className="metric-block closing">
            <span>{labelText.closing}</span>
            <AnimatedMoney value={item.closing_balance} className={closingDelta >= 0 ? "money-income" : "money-expense"} />
          </div>
        </div>
        <div className="metric-separator" />
        <div className="metric-row"><span><i className="metric-dot expense" />{labelText.expenses}</span><AnimatedMoney value={item.total_expenses} /></div>
        <div className="metric-row"><span><i className="metric-dot income" />{labelText.income}</span><AnimatedMoney value={item.total_income} /></div>
        <p className="month-card-count">{labelText.count}</p>
        {!isFuture && (
          <div className="month-bars" aria-label="Comparação de gastos e ganhos">
            <div className="movement-row">
              <span>{labelText.expenses}</span>
              <div className="movement-track"><i className="expense" style={{ width: `${expenseWidth}%` }} /></div>
              <AnimatedMoney value={item.total_expenses} />
            </div>
            <div className="movement-row">
              <span>{labelText.income}</span>
              <div className="movement-track"><i className="income" style={{ width: `${incomeWidth}%` }} /></div>
              <AnimatedMoney value={item.total_income} />
            </div>
            <strong className={`movement-net ${movementClass}`}>{movementLabel}{formatMoney(Math.abs(net), language)}</strong>
          </div>
        )}
      </div>
      <footer className="month-card-footer">
        <button className="btn btn-ghost" onClick={onQuickAdd}><Plus size={16} /> {labelText.quickAdd}</button>
      </footer>
    </article>
  );
}


