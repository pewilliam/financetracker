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
import { daysUntil, formatDateShort, formatMoney } from "../utils/format.js";

function percentChange(current, previous) {
  const now = Number(current || 0);
  const before = Number(previous || 0);
  if (!before) return now ? 100 : 0;
  return ((now - before) / Math.abs(before)) * 100;
}

export default function Dashboard({
  summary,
  balanceSeries,
  comparisons,
  invoices = [],
  monthData,
  onOpenInvoice
}) {
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

  const cards = [
    {
      label: "Saldo atual",
      value: formatMoney(summary.current_balance),
      meta: `${percentChange(summary.current_balance, previous.projected_closing).toFixed(1)}% vs mês anterior`
    },
    {
      label: "Gastos do mês",
      value: formatMoney(summary.total_expenses),
      progress: expenseProgress,
      tone: "expense"
    },
    {
      label: "Ganhos do mês",
      value: formatMoney(summary.total_income),
      progress: incomeProgress,
      tone: "income"
    },
    {
      label: "Projeção de fechamento",
      value: formatMoney(summary.projected_closing),
      meta: `Futuro líquido ${formatMoney(summary.future_net)}`
    }
  ];

  return (
    <div className="dashboard-grid">
      <section className="summary-grid">
        {cards.map((card) => (
          <article className="card stat-card" key={card.label}>
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
        <h2>Evolução do saldo</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={balanceSeries}>
            <defs>
              <linearGradient id="saldoFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(value) => value.slice(-2)} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR")}`} tickLine={false} axisLine={false} width={82} />
            <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={formatDateShort} />
            <Area type="monotone" dataKey="balance" stroke="#3B82F6" strokeWidth={3} fill="url(#saldoFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="card chart-card wide">
        <h2>Histórico mensal</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={comparisons}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR")}`} tickLine={false} axisLine={false} width={82} />
            <Tooltip formatter={(value) => formatMoney(value)} />
            <Bar dataKey="total_expenses" name="Gastos" fill="#EF4444" radius={[6, 6, 0, 0]} />
            <Bar dataKey="total_income" name="Ganhos" fill="#10B981" radius={[6, 6, 0, 0]} />
            <Line dataKey="projected_closing" name="Saldo final" stroke="#3B82F6" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h2>Próximos vencimentos</h2>
        <div className="stack-list">
          {openInvoices.length ? openInvoices.slice(0, 5).map((invoice) => (
            <button className="due-item" key={invoice.id} onClick={() => onOpenInvoice?.(invoice)}>
              <span>
                <strong>{invoice.name}</strong>
                <small>{formatDateShort(invoice.due_date)}</small>
              </span>
              <span className={`due-badge compact ${daysUntil(invoice.due_date).includes("hoje") || daysUntil(invoice.due_date) === "Vencida" ? "danger" : ""}`}>
                {daysUntil(invoice.due_date)}
              </span>
              <span className="due-amount">{formatMoney(invoice.total_amount)}</span>
            </button>
          )) : <p className="muted">Nenhuma fatura futura.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Maiores gastos do mês</h2>
        <div className="stack-list">
          {topExpenses.length ? topExpenses.map((tx) => (
            <div className="expense-bar" key={tx.id}>
              <div>
                <strong>{tx.description || "Sem descrição"}</strong>
                <span>{formatMoney(tx.amount)}</span>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(Number(tx.amount) / maxExpense) * 100}%` }} />
              </div>
            </div>
          )) : <p className="muted">Sem gastos registrados neste mês.</p>}
        </div>
      </section>
    </div>
  );
}
