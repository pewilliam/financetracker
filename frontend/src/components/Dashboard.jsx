import { formatMoney } from "../utils/format.js";

function BalanceChart({ series }) {
  if (!series.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        Sem dados ainda
      </div>
    );
  }

  const values = series.map((point) => Number(point.balance));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1 || 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  });

  const path = `M ${points.join(" L ")}`;

  return (
    <svg viewBox="0 0 100 100" className="h-40 w-full">
      <defs>
        <linearGradient id="balanceGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L 100,100 L 0,100 Z`}
        fill="url(#balanceGradient)"
      />
      <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" />
    </svg>
  );
}

export default function Dashboard({ summary, balanceSeries, comparisons }) {
  const differenceValue = Number(summary.difference);
  const differenceClass =
    differenceValue < 0 ? "text-rose-600" : "text-emerald-600";

  const cards = [
    {
      label: "Saldo atual",
      value: formatMoney(summary.current_balance),
      tone: "chip-balance"
    },
    {
      label: "Total gastos",
      value: formatMoney(summary.total_expenses),
      tone: "chip-expense"
    },
    {
      label: "Total ganhos",
      value: formatMoney(summary.total_income),
      tone: "chip-income"
    },
    {
      label: "Diferenca",
      value: formatMoney(summary.difference),
      tone: differenceValue < 0 ? "chip-expense" : "chip-income"
    }
  ];

  const maxTotal = Math.max(
    ...comparisons.map((item) => Math.max(item.total_expenses, item.total_income)),
    1
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="glass-card rounded-3xl p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <div
              key={card.label}
              className="stat-card"
            >
              <div className="flex items-center justify-between">
                <p className="stat-label">{card.label}</p>
                <span className={`chip ${card.tone}`}>mes</span>
              </div>
              <p className={`stat-value ${card.label === "Diferenca" ? differenceClass : ""}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <p className="text-sm text-slate-500">Projecao do saldo final</p>
          <p className="text-2xl font-semibold">
            {formatMoney(summary.projected_closing)}
          </p>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500">Evolucao diaria</p>
          <BalanceChart series={balanceSeries} />
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6">
        <h3 className="text-lg font-semibold">Comparativo mensal</h3>
        <div className="mt-4 space-y-3">
          {comparisons.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{item.label}</span>
                <span>
                  {formatMoney(item.total_expenses)} / {formatMoney(item.total_income)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-rose-400"
                  style={{ width: `${(item.total_expenses / maxTotal) * 100}%` }}
                />
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-emerald-400"
                  style={{ width: `${(item.total_income / maxTotal) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
