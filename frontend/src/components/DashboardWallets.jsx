import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Banknote, Building2, CircleDollarSign, Landmark, Loader2, SlidersHorizontal, TrendingUp, WalletCards } from "lucide-react";
import { getDashboardWallets } from "../api/api.js";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

const TYPE_ICONS = { checking: Landmark, digital: Building2, cash: Banknote, reserve: CircleDollarSign, investment: TrendingUp, other: WalletCards };
const TYPE_LABELS = {
  checking: ["Conta corrente", "Checking"],
  digital: ["Conta digital", "Digital account"],
  cash: ["Dinheiro", "Cash"],
  reserve: ["Reserva", "Reserve"],
  investment: ["Investimento", "Investment"],
  other: ["Outros", "Other"],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function DashboardWallets({ year, month, refreshKey = 0, dayTransactions = [] }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!year || !month) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    getDashboardWallets(year, month, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setPayload(data);
      })
      .catch((requestError) => {
        if (requestError?.name === "AbortError" || controller.signal.aborted) return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [year, month, refreshKey, attempt]);

  const wallets = (payload?.wallets || []).filter((wallet) => wallet.active !== false);
  const dayIncome = dayTransactions.filter((item) => item.type === "income").reduce((total, item) => total + toNumber(item.amount), 0);
  const dayExpenses = dayTransactions.filter((item) => item.type === "expense").reduce((total, item) => total + toNumber(item.amount), 0);
  const dayGroups = [];
  const groupsByWallet = new Map();
  dayTransactions.forEach((transaction) => {
    const key = transaction.wallet?.id ?? transaction.wallet?.name ?? "none";
    if (!groupsByWallet.has(key)) {
      const group = {
        key,
        name: transaction.wallet?.name || copy("Sem carteira", "No wallet"),
        transactions: [],
      };
      groupsByWallet.set(key, group);
      dayGroups.push(group);
    }
    groupsByWallet.get(key).transactions.push(transaction);
  });
  const typeLabel = (type) => {
    const labels = TYPE_LABELS[type] || TYPE_LABELS.other;
    return language === "en-US" ? labels[1] : labels[0];
  };

  return (
    <section className="card dashboard-wallets" aria-label={copy("Carteiras", "Wallets")}>
      <div className="dashboard-card-head list-head">
        <div>
          <p className="eyebrow">{copy("Onde está o dinheiro", "Where the money is")}</p>
          <h2>{copy("Carteiras", "Wallets")}</h2>
        </div>
        <div className="dashboard-wallets-head-actions">
          {!loading && !error && wallets.length > 0 && (
            <span className="dashboard-head-total">
              <small>{copy("Total", "Total")}</small>
              <strong>{formatMoney(payload?.total_balance, language)}</strong>
            </span>
          )}
          <Link className="dashboard-wallets-link" to="/carteiras">{copy("Ver carteiras", "View wallets")}<ArrowRight size={14} /></Link>
        </div>
      </div>

      {loading && (
        <div className="dashboard-wallets-state" role="status">
          <Loader2 size={18} className="spin" />
          <span>{copy("Carregando carteiras", "Loading wallets")}</span>
        </div>
      )}

      {!loading && error && (
        <div className="dashboard-wallets-state">
          <AlertTriangle size={18} />
          <strong>{copy("Não foi possível carregar as carteiras", "Unable to load wallets")}</strong>
          <button className="btn compact" type="button" onClick={() => setAttempt((current) => current + 1)}>{copy("Tentar novamente", "Try again")}</button>
        </div>
      )}

      {!loading && !error && (
        <div className="dashboard-day-summary">
          <div className="dashboard-day-summary-head">
            <strong>{copy("Transações de hoje", "Today's transactions")}</strong>
            <small>{dayTransactions[0]?.date ? formatDateShort(dayTransactions[0].date, language) : copy("Hoje", "Today")} · {dayTransactions.length} {copy(dayTransactions.length === 1 ? "lançamento" : "lançamentos", dayTransactions.length === 1 ? "entry" : "entries")}</small>
            <div className="dashboard-day-totals">
              <span className="income"><small>{copy("Ganhos", "Income")}</small><b>{formatMoney(dayIncome, language)}</b></span>
              <span className="expense"><small>{copy("Gastos", "Expenses")}</small><b>{formatMoney(dayExpenses, language)}</b></span>
            </div>
          </div>
          {dayGroups.length ? (
            <div className="dashboard-day-groups">
              {dayGroups.map((group) => (
                <section key={group.key}>
                  <header>
                    <strong>{group.name}</strong>
                    <small>{group.transactions.length} {copy(group.transactions.length === 1 ? "lançamento" : "lançamentos", group.transactions.length === 1 ? "entry" : "entries")}</small>
                  </header>
                  <ul>
                    {group.transactions.map((transaction) => (
                      <li key={transaction.id}>
                        <span>{transaction.description || copy("Sem descrição", "No description")}</span>
                        <strong className={transaction.type === "income" ? "money-income" : "money-expense"}>{formatMoney(transaction.amount, language)}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : <p>{copy("Nenhum lançamento hoje.", "No entries today.")}</p>}
        </div>
      )}

      {!loading && !error && wallets.length === 0 && (
        <div className="dashboard-wallets-state">
          <WalletCards size={18} />
          <strong>{copy("Nenhuma carteira ativa", "No active wallets")}</strong>
          <span>{copy("Crie uma carteira para acompanhar o saldo por conta.", "Create a wallet to track the balance of each account.")}</span>
          <Link className="btn btn-primary compact" to="/carteiras">{copy("Abrir carteiras", "Open wallets")}</Link>
        </div>
      )}

      {!loading && !error && wallets.length > 0 && (
        <div className="dashboard-wallet-grid">
          {wallets.map((wallet) => <WalletCard key={wallet.wallet_id} wallet={wallet} copy={copy} language={language} typeLabel={typeLabel} />)}
        </div>
      )}
    </section>
  );
}

function WalletCard({ wallet, copy, language, typeLabel }) {
  const Icon = TYPE_ICONS[wallet.type] || WalletCards;
  const variation = toNumber(wallet.period_variation);
  const variationClass = variation > 0 ? "positive" : variation < 0 ? "negative" : "neutral";
  const adjustments = toNumber(wallet.period_adjustments);
  return (
    <article className={`dashboard-wallet-card${wallet.changed_in_period ? " changed" : ""}`} style={{ "--wallet-color": wallet.color || "#14A078" }}>
      <div className="dashboard-wallet-heading">
        <i><Icon size={16} /></i>
        <div>
          <small>{wallet.institution || typeLabel(wallet.type)}</small>
          <strong>{wallet.name}</strong>
        </div>
        {wallet.changed_in_period && <em>{copy("Movimentou", "Changed")}</em>}
      </div>
      <p className="dashboard-wallet-balance">{formatMoney(wallet.current_balance, language)}</p>
      <div className="dashboard-wallet-flow">
        <span><small>{copy("Ganhos", "Income")}</small><strong className="money-income">{formatMoney(wallet.period_income, language)}</strong></span>
        <span><small>{copy("Gastos", "Expenses")}</small><strong className="money-expense">{formatMoney(wallet.period_expenses, language)}</strong></span>
        <span className={variationClass}><small>{copy("Variação", "Change")}</small><strong>{formatMoney(wallet.period_variation, language)}</strong></span>
        {adjustments !== 0 && (
          <span><small><SlidersHorizontal size={11} />{copy("Ajuste", "Adjustment")}</small><strong>{formatMoney(wallet.period_adjustments, language)}</strong></span>
        )}
      </div>
    </article>
  );
}
