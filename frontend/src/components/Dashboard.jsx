import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useI18n } from "../i18n/index.ts";
import { daysUntil, formatDateShort, formatMoney, getDaysUntil } from "../utils/format.js";

function percentChange(current, previous) {
  const now = Number(current || 0);
  const before = Number(previous || 0);
  if (!before) return now ? 100 : 0;
  return ((now - before) / Math.abs(before)) * 100;
}

function moneyAxisWidth(values, language) {
  const longest = values.reduce((max, value) => {
    const label = formatMoney(value, language);
    return Math.max(max, label.length);
  }, 0);
  return Math.min(Math.max(longest * 8 + 28, 104), 168);
}

export default function Dashboard({
  summary,
  balanceSeries,
  comparisons,
  invoices = [],
  monthData,
  onOpenInvoice
}) {
  const { t, language } = useI18n();
  const previous = comparisons[comparisons.length - 2] || comparisons[0] || {};
  const expenseProgress = Math.min((Number(summary.total_expenses) / Math.max(Number(previous.total_expenses || 1), 1)) * 100, 140);
  const incomeProgress = Math.min((Number(summary.total_income) / Math.max(Number(previous.total_income || 1), 1)) * 100, 140);

  const topExpenses = (monthData?.days || [])
    .flatMap((day) => day.transactions)
    .filter((tx) => tx.type === "expense")
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5);
  const maxExpense = Math.max(...topExpenses.map((tx) => Number(tx.amount)), 1);
  const openInvoices = invoices.filter((invoice) => !invoice.paid);
  const balanceAxisWidth = moneyAxisWidth(balanceSeries.map((item) => item.balance), language);
  const historyAxisWidth = moneyAxisWidth(
    comparisons.flatMap((item) => [
      item.total_expenses,
      item.total_income,
      item.projected_closing
    ]),
    language
  );

  const cards = [
    {
      label: t("dashboard.currentBalance"),
      value: formatMoney(summary.current_balance, language),
      meta: t("dashboard.previousMonthComparison", { value: percentChange(summary.current_balance, previous.projected_closing).toFixed(1) }),
      tone: "balance"
    },
    {
      label: t("dashboard.monthExpenses"),
      value: formatMoney(summary.total_expenses, language),
      progress: expenseProgress,
      tone: "expense"
    },
    {
      label: t("dashboard.monthIncome"),
      value: formatMoney(summary.total_income, language),
      progress: incomeProgress,
      tone: "income"
    },
    {
      label: t("dashboard.closingProjection"),
      value: formatMoney(summary.projected_closing, language),
      meta: t("dashboard.futureNet", { value: formatMoney(summary.future_net, language) })
    }
  ];

  return (
    <div className="dashboard-grid">
      <section className="summary-grid">
        {cards.map((card) => (
          <article className={`card stat-card ${card.tone ? `stat-card-${card.tone}` : ""}`} key={card.label}>
            <p className="stat-label">{card.label}</p>
            <p className="stat-value">{card.value}</p>
            {card.progress ? (
              <div className="progress">
                <span className={card.tone} style={{ width: `${card.progress}%` }} />
              </div>
            ) : (
              <p className="stat-meta">{card.meta}</p>
            )}
          </article>
        ))}
      </section>

      <section className="card chart-card wide">
        <h2>{t("dashboard.balanceEvolution")}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={balanceSeries} margin={{ left: 8, right: 12 }}>
            <defs>
              <linearGradient id="saldoFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#14A078" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#14A078" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(value) => value.slice(-2)} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => formatMoney(value, language)} tickLine={false} axisLine={false} tickMargin={8} width={balanceAxisWidth} />
            <Tooltip formatter={(value) => formatMoney(value, language)} labelFormatter={(value) => formatDateShort(value, language)} />
            <Area type="monotone" dataKey="balance" stroke="#14A078" strokeWidth={3} fill="url(#saldoFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="card chart-card wide">
        <h2>{t("dashboard.monthlyHistory")}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={comparisons} margin={{ left: 8, right: 12 }}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => formatMoney(value, language)} tickLine={false} axisLine={false} tickMargin={8} width={historyAxisWidth} />
            <Tooltip formatter={(value) => formatMoney(value, language)} />
            <Bar dataKey="total_expenses" name={t("dashboard.expenses")} fill="#FF4D6A" radius={[6, 6, 0, 0]} />
            <Bar dataKey="total_income" name={t("dashboard.income")} fill="#3CC88C" radius={[6, 6, 0, 0]} />
            <Line dataKey="projected_closing" name={t("dashboard.finalBalance")} stroke="#14A078" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h2>{t("dashboard.upcomingDueDates")}</h2>
        <div className="stack-list">
          {openInvoices.length ? openInvoices.slice(0, 5).map((invoice) => {
            const days = getDaysUntil(invoice.due_date);
            return (
              <button className="due-item" key={invoice.id} onClick={() => onOpenInvoice?.(invoice)}>
                <span>
                  <strong>{invoice.name}</strong>
                  <small>{formatDateShort(invoice.due_date, language)}</small>
                </span>
                <span className={`due-badge compact ${days <= 0 ? "danger" : ""}`}>
                  {daysUntil(invoice.due_date, language)}
                </span>
                <span className="due-amount">{formatMoney(invoice.total_amount, language)}</span>
              </button>
            );
          }) : <p className="muted">{t("dashboard.noFutureInvoices")}</p>}
        </div>
      </section>

      <section className="card">
        <h2>{t("dashboard.biggestExpenses")}</h2>
        <div className="stack-list">
          {topExpenses.length ? topExpenses.map((tx) => (
            <div className="expense-bar" key={tx.id}>
              <div>
                <strong>{tx.description || t("dashboard.noDescription")}</strong>
                <span>{formatMoney(tx.amount, language)}</span>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(Number(tx.amount) / maxExpense) * 100}%` }} />
              </div>
            </div>
          )) : <p className="muted">{t("dashboard.noExpenses")}</p>}
        </div>
      </section>
    </div>
  );
}
