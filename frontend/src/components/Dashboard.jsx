import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CircleDollarSign,
  Clock3, Minus, Plus, ReceiptText, TrendingDown, TrendingUp, WalletCards
} from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { daysUntil, formatDateShort, formatMoney, getDaysUntil } from "../utils/format.js";
import { getMonthPeriod, isInvoiceTransaction } from "../app/helpers.js";
import { buildVisibleExpenseGroups, expenseGroupKey } from "../utils/categoryGroups.js";
import CategoryExpenseDetailsModal from "../modals/CategoryExpenseDetailsModal.jsx";
import DashboardWallets from "./DashboardWallets.jsx";

const EMPTY_CATEGORY_BREAKDOWN = {
  total_expenses: 0, categorized_total: 0, items: [], chart_items: [],
  total_income: 0, income_categorized_total: 0, income_items: [], income_chart_items: []
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentChange(current, previous) {
  const now = toNumber(current);
  const before = toNumber(previous);
  if (!before) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function formatCompactMoney(value, language) {
  const amount = toNumber(value);
  const absolute = Math.abs(amount);
  if (absolute < 1000) return formatMoney(amount, language);
  const divisor = absolute >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = absolute >= 1_000_000 ? (language === "en-US" ? "M" : " mi") : (language === "en-US" ? "K" : " mil");
  const formatted = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(amount / divisor);
  return `R$ ${formatted}${suffix}`;
}

function chartDomain(values) {
  const numeric = values.map(toNumber);
  if (!numeric.length) return [0, 100];
  const minimum = Math.min(...numeric);
  const maximum = Math.max(...numeric);
  const span = maximum - minimum;
  const padding = span > 0 ? span * 0.14 : Math.max(Math.abs(maximum) * 0.08, 100);
  return [minimum - padding, maximum + padding];
}

function localTodayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function movementClass(value) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function MovementIcon({ value, size = 15 }) {
  if (value > 0) return <ArrowUpRight size={size} />;
  if (value < 0) return <ArrowDownRight size={size} />;
  return <Minus size={size} />;
}

function BalanceTooltip({ active, payload, label, language }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const realized = row?.realizedBalance;
  const projected = row?.projectedBalance ?? row?.balance;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{formatDateShort(label, language)}</strong>
      {realized != null && (
        <span><i className="balance" />{language === "en-US" ? "Actual balance" : "Saldo realizado"}<b>{formatMoney(realized, language)}</b></span>
      )}
      {projected != null && (
        <span><i className="balance" />{language === "en-US" ? "Projected balance" : "Saldo projetado"}<b>{formatMoney(projected, language)}</b></span>
      )}
      {toNumber(row?.plannedReceivable) > 0 && (
        <span><i className="income" />{language === "en-US" ? "Planned receivable" : "Recebível previsto"}<b>{formatMoney(row.plannedReceivable, language)}</b></span>
      )}
    </div>
  );
}

function HistoryTooltip({ active, payload, label, language }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{label}</strong>
      <span><i className="income" />{language === "en-US" ? "Income" : "Ganhos"}<b>{formatMoney(item.total_income, language)}</b></span>
      <span><i className="expense" />{language === "en-US" ? "Expenses" : "Gastos"}<b>{formatMoney(item.total_expenses, language)}</b></span>
      <span><i className="balance" />{language === "en-US" ? "Final balance" : "Saldo final"}<b>{formatMoney(item.projected_closing, language)}</b></span>
      <span className={movementClass(item.result)}><i />{language === "en-US" ? "Result" : "Resultado"}<b>{formatMoney(item.result, language)}</b></span>
    </div>
  );
}

function CategoryTooltip({ active, payload, language }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="dashboard-chart-tooltip category">
      <strong>{item.name}</strong>
      <span><i style={{ background: item.color }} />{toNumber(item.percentage).toFixed(1)}%<b>{formatMoney(item.amount, language)}</b></span>
    </div>
  );
}

function ComparisonMeta({ value, inverse = false, language }) {
  if (value == null) return <span className="stat-comparison neutral">{language === "en-US" ? "No previous-month baseline" : "Sem base no mês anterior"}</span>;
  const semanticValue = inverse ? -value : value;
  return (
    <span className={`stat-comparison ${movementClass(semanticValue)}`}>
      <MovementIcon value={value} />
      {Math.abs(value).toFixed(1)}% {language === "en-US" ? "vs previous month" : "vs mês anterior"}
    </span>
  );
}

export default function Dashboard({ summary, balanceSeries = [], comparisons = [], invoices = [], monthData, categories = [], categoryBreakdown = EMPTY_CATEGORY_BREAKDOWN, historyLoading = false, categoriesLoading = false, loadError = false, onRetry, onLoadCategoryDetails, onOpenTransaction, onNewTransaction, activeSection = "overview", onActiveSectionChange, year, month, walletRefreshKey = 0 }) {
  const { t, language } = useI18n();
  const safeSummary = summary || {};
  const safeCategoryBreakdown = categoryBreakdown || EMPTY_CATEGORY_BREAKDOWN;
  const [categoryView, setCategoryView] = useState("income");
  const [selectedExpenseGroup, setSelectedExpenseGroup] = useState(null);
  const [detailedExpenseGroups, setDetailedExpenseGroups] = useState(null);
  const [expenseDetailsLoading, setExpenseDetailsLoading] = useState(false);
  const [expenseDetailsError, setExpenseDetailsError] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllDueDates, setShowAllDueDates] = useState(false);
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const detailsRequestRef = useRef(null);
  const detailsGenerationRef = useRef(0);
  const copy = (pt, en) => language === "en-US" ? en : pt;

  useEffect(() => {
    detailsGenerationRef.current += 1;
    setSelectedExpenseGroup(null);
    setDetailedExpenseGroups(null);
    setExpenseDetailsLoading(false);
    setExpenseDetailsError(false);
    detailsRequestRef.current = null;
  }, [categoryBreakdown, categoryView]);

  const previous = comparisons.length > 1 ? comparisons[comparisons.length - 2] : null;
  const incomeChange = previous ? percentChange(safeSummary.total_income, previous.total_income) : null;
  const expenseChange = previous ? percentChange(safeSummary.total_expenses, previous.total_expenses) : null;
  const balanceChange = previous ? percentChange(safeSummary.current_balance, previous.projected_closing) : null;
  const hasProjection = safeSummary.projected_closing !== null && safeSummary.projected_closing !== undefined;
  const plannedReceivablesTotal = toNumber(safeSummary.planned_receivables_total);
  const transactionsProjectedClosing = toNumber(
    safeSummary.transactions_projected_closing ?? (toNumber(safeSummary.projected_closing) - plannedReceivablesTotal)
  );

  const transactions = (monthData?.days || []).flatMap((day) => day.transactions || []);
  const allExpenses = transactions.filter((transaction) => transaction.type === "expense").sort((left, right) => toNumber(right.amount) - toNumber(left.amount));
  const visibleExpenses = showAllExpenses ? allExpenses : allExpenses.slice(0, 5);
  const maxExpense = Math.max(...allExpenses.map((transaction) => toNumber(transaction.amount)), 1);

  const openInvoices = invoices.filter((invoice) => !invoice.paid && !invoice.is_projected).sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)) || Number(left.id) - Number(right.id));
  const visibleInvoices = showAllDueDates ? openInvoices : openInvoices.slice(0, 5);
  const openInvoiceTotal = openInvoices.reduce((total, invoice) => total + toNumber(invoice.total_amount), 0);

  const todayIso = localTodayIso();
  const balanceChartData = useMemo(() => {
    const days = monthData?.days?.length
      ? monthData.days
      : balanceSeries.map((item) => ({ date: item.date, balance: item.balance, planned_receivables: [] }));

    let runningPlanned = toNumber(monthData?.prior_planned_receivables_total);
    const series = days.map((day) => {
      const dayPlanned = (day.planned_receivables || []).reduce((total, item) => total + toNumber(item.remaining_amount), 0);
      runningPlanned += dayPlanned;
      const balance = toNumber(day.balance);
      const projected = day.projected_balance == null ? balance + runningPlanned : toNumber(day.projected_balance);
      return {
        date: day.date,
        balance,
        plannedReceivable: dayPlanned,
        cumulativePlanned: projected - balance,
      };
    });

    const firstProjectedIndex = series.findIndex((item) => item.date > todayIso);
    const hasOpenPlanned = toNumber(monthData?.prior_planned_receivables_total) > 0 || series.some((item) => item.plannedReceivable > 0);

    return series.map((item, index) => {
      const bridgeFromYesterday = firstProjectedIndex >= 0 && index >= Math.max(0, firstProjectedIndex - 1);
      const isFutureOrToday = item.date >= todayIso;
      const projectedBalance = bridgeFromYesterday || (firstProjectedIndex === -1 && hasOpenPlanned && isFutureOrToday)
        ? item.balance + (isFutureOrToday ? item.cumulativePlanned : 0)
        : null;

      return {
        ...item,
        realizedBalance: firstProjectedIndex === -1 || index < firstProjectedIndex ? item.balance : null,
        projectedBalance,
      };
    });
  }, [balanceSeries, monthData, todayIso]);
  const balanceDomain = chartDomain(balanceChartData.flatMap((item) => [item.balance, item.projectedBalance].filter((value) => value != null)));
  const period = getMonthPeriod({
    year: monthData?.year ?? safeSummary.year,
    month: monthData?.month ?? safeSummary.month,
  });
  const isPastMonth = period === "past";
  const isFutureMonth = period === "future";
  const openingBalance = monthData?.opening_balance;
  const closingBalance = monthData?.closing_balance ?? safeSummary.current_balance;
  const balanceEndValue = isPastMonth
    ? closingBalance
    : isFutureMonth
      ? safeSummary.projected_closing
      : safeSummary.current_balance;
  const balanceVariation = toNumber(balanceEndValue) - toNumber(openingBalance);
  const containsToday = balanceChartData.some((item) => item.date === todayIso);
  const containsProjection = balanceChartData.some((item) => item.projectedBalance != null);
  const hasBalanceActivity = transactions.length > 0
    || plannedReceivablesTotal > 0
    || balanceChartData.some((item, index) => index > 0 && item.balance !== balanceChartData[index - 1].balance);

  const historyData = comparisons.map((item, index) => ({
    ...item,
    total_income: toNumber(item.total_income),
    total_expenses: toNumber(item.total_expenses),
    projected_closing: toNumber(item.projected_closing),
    result: toNumber(item.total_income) - toNumber(item.total_expenses),
    selected: index === comparisons.length - 1
  }));
  const historyFlowDomain = chartDomain(historyData.flatMap((item) => [item.total_income, item.total_expenses]));
  const historyBalanceDomain = chartDomain(historyData.map((item) => item.projected_closing));
  const hasHistory = historyData.some((item) => item.total_income !== 0 || item.total_expenses !== 0 || item.projected_closing !== 0);
  const historySummary = useMemo(() => {
    if (!historyData.length) return null;
    const best = historyData.reduce((current, item) => item.result > current.result ? item : current);
    const worst = historyData.reduce((current, item) => item.result < current.result ? item : current);
    return {
      variation: historyData.at(-1).projected_closing - historyData[0].projected_closing,
      averageIncome: historyData.reduce((total, item) => total + item.total_income, 0) / historyData.length,
      averageExpenses: historyData.reduce((total, item) => total + item.total_expenses, 0) / historyData.length,
      best,
      worst
    };
  }, [historyData]);

  const ignoredCategoryIds = useMemo(() => new Set(categories.filter((category) => category.ignore_in_category_analysis).map((category) => category.id)), [categories]);
  const expenseCategoryGroups = useMemo(() => buildVisibleExpenseGroups(safeCategoryBreakdown.chart_items || safeCategoryBreakdown.items, categories, ignoredCategoryIds), [safeCategoryBreakdown.chart_items, safeCategoryBreakdown.items, categories, ignoredCategoryIds]);
  const incomeCategoryGroups = useMemo(() => buildVisibleExpenseGroups(safeCategoryBreakdown.income_chart_items || safeCategoryBreakdown.income_items, categories, ignoredCategoryIds), [safeCategoryBreakdown.income_chart_items, safeCategoryBreakdown.income_items, categories, ignoredCategoryIds]);
  const viewingIncome = categoryView === "income";
  const categoryItems = (viewingIncome ? incomeCategoryGroups : expenseCategoryGroups).filter((item) => toNumber(item.amount) > 0);
  const categoryTotal = categoryItems.reduce((total, item) => total + toNumber(item.amount), 0);
  const categoryGroupedTotal = categoryTotal;
  const categoryChartItems = categoryItems;
  const visibleCategoryItems = showAllCategories ? categoryItems : categoryItems.slice(0, 5);
  const maxCategory = Math.max(...categoryItems.map((item) => toNumber(item.amount)), 1);

  const resolveDetailedGroup = (group, loadedGroups) => {
    return loadedGroups.find((item) => expenseGroupKey(item) === expenseGroupKey(group)) || group;
  };

  const openCategoryDetails = async (group) => {
    const generation = detailsGenerationRef.current;
    const cachedGroup = detailedExpenseGroups ? resolveDetailedGroup(group, detailedExpenseGroups) : null;
    setSelectedExpenseGroup(cachedGroup || group);
    setExpenseDetailsError(false);
    if (cachedGroup || !onLoadCategoryDetails) return;

    setExpenseDetailsLoading(true);
    try {
      const request = detailsRequestRef.current || onLoadCategoryDetails();
      detailsRequestRef.current = request;
      const breakdown = await request;
      if (generation !== detailsGenerationRef.current) return;
      const loadedGroups = buildVisibleExpenseGroups(viewingIncome ? breakdown.income_chart_items || breakdown.income_items : breakdown.chart_items || breakdown.items, categories, ignoredCategoryIds);
      setDetailedExpenseGroups(loadedGroups);
      setSelectedExpenseGroup((current) => current ? resolveDetailedGroup(current, loadedGroups) : null);
    } catch {
      if (generation !== detailsGenerationRef.current) return;
      detailsRequestRef.current = null;
      setExpenseDetailsError(true);
    } finally {
      if (generation === detailsGenerationRef.current) setExpenseDetailsLoading(false);
    }
  };

  const projectionMeta = !hasProjection
    ? copy("Sem projeção para este período", "No projection for this period")
    : plannedReceivablesTotal > 0
      ? (
        <>
          <span>{t("dashboard.realizedVsProjected", {
            realized: formatMoney(transactionsProjectedClosing, language),
            projected: formatMoney(safeSummary.projected_closing, language),
          })}</span>
          <span className="stat-meta-secondary">{t("dashboard.plannedReceivables", { value: formatMoney(plannedReceivablesTotal, language) })}</span>
        </>
      )
      : t("dashboard.futureNet", { value: formatMoney(safeSummary.future_net, language) });

  const balanceCard = isPastMonth || isFutureMonth
    ? {
      id: "balance",
      label: copy("Saldo inicial", "Opening balance"),
      value: formatMoney(openingBalance, language),
      tone: "balance",
      icon: WalletCards,
      comparison: isFutureMonth
        ? <ComparisonMeta value={balanceChange} language={language} />
        : (
          <span className="stat-comparison neutral">
            {copy("Início do período", "Period opening")}
          </span>
        )
    }
    : {
      id: "balance",
      label: t("dashboard.currentBalance"),
      value: formatMoney(safeSummary.current_balance, language),
      tone: "balance",
      icon: WalletCards,
      opening: formatMoney(openingBalance, language),
      comparison: <ComparisonMeta value={balanceChange} language={language} />
    };

  const closingCard = isPastMonth
    ? {
      id: "projection",
      label: copy("Saldo final", "Closing balance"),
      value: formatMoney(closingBalance, language),
      tone: "projection",
      icon: CalendarClock,
      comparison: <ComparisonMeta value={balanceChange} language={language} />
    }
    : {
      id: "projection",
      label: t("dashboard.closingProjection"),
      value: hasProjection ? formatMoney(safeSummary.projected_closing, language) : copy("Indisponível", "Unavailable"),
      tone: "projection",
      icon: CalendarClock,
      badge: copy("Projeção", "Projection"),
      meta: projectionMeta
    };

  const cards = [
    balanceCard,
    { id: "income", label: t("dashboard.monthIncome"), value: formatMoney(safeSummary.total_income, language), tone: "income", icon: TrendingUp, comparison: <ComparisonMeta value={incomeChange} language={language} /> },
    { id: "expense", label: t("dashboard.monthExpenses"), value: formatMoney(safeSummary.total_expenses, language), tone: "expense", icon: TrendingDown, comparison: <ComparisonMeta value={expenseChange} inverse language={language} /> },
    closingCard
  ];
  const todayTransactions = (monthData?.days || []).find((day) => day.date === todayIso)?.transactions || [];
  const sections = [
    { id: "overview", label: copy("Visão geral", "Overview") },
    { id: "wallets", label: copy("Carteiras", "Wallets") },
    { id: "history", label: copy("Histórico", "History") },
    { id: "categories", label: copy("Categorias", "Categories") }
  ];
  const selectSectionFromKeyboard = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? sections.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length;
    onActiveSectionChange?.(sections[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`dashboard-tab-${sections[nextIndex].id}`)?.focus());
  };

  if (loadError) {
    return <div className="dashboard-grid dashboard-redesign"><DashboardEmpty card icon={AlertTriangle} title={copy("Não foi possível carregar o dashboard", "Unable to load the dashboard")} description={copy("Verifique sua conexão e tente novamente.", "Check your connection and try again.")} action={onRetry} actionLabel={copy("Tentar novamente", "Try again")} /></div>;
  }

  return (
    <div className="dashboard-grid dashboard-redesign">
      <section className="summary-grid dashboard-summary-grid" aria-label={copy("Indicadores financeiros", "Financial indicators")}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className={`card stat-card dashboard-stat-card stat-card-${card.tone}`} key={card.id}>
              <div className="dashboard-stat-head">
                <span className="dashboard-stat-icon"><Icon size={17} /></span>
                {card.opening && (
                  <span className="opening-badge">
                    <small>{copy("Inicial", "Opening")}</small>
                    <strong>{card.opening}</strong>
                  </span>
                )}
                {card.badge && <span className="projection-badge"><Clock3 size={12} /> {card.badge}</span>}
              </div>
              <p className="stat-label">{card.label}</p>
              <p className="stat-value">{card.value}</p>
              {card.comparison || <div className="stat-meta">{card.meta}</div>}
            </article>
          );
        })}
      </section>

      <div className="categories-budget-tabs dashboard-section-tabs" role="tablist" aria-label={copy("Seções do dashboard", "Dashboard sections")}>
        {sections.map((section, index) => (
          <button id={`dashboard-tab-${section.id}`} className={activeSection === section.id ? "active" : ""} type="button" role="tab" aria-selected={activeSection === section.id} aria-controls={`dashboard-panel-${section.id}`} tabIndex={activeSection === section.id ? 0 : -1} onClick={() => onActiveSectionChange?.(section.id)} onKeyDown={(event) => selectSectionFromKeyboard(event, index)} key={section.id}>{section.label}</button>
        ))}
      </div>

      {activeSection === "overview" && (
        <section className="dashboard-section" id="dashboard-panel-overview" role="tabpanel" aria-labelledby="dashboard-tab-overview">
          <section className="card chart-card dashboard-balance-card">
            <div className="dashboard-card-head balance-head">
              <div><p className="eyebrow">{copy("Fluxo do mês", "Monthly cash flow")}</p><h2>{t("dashboard.balanceEvolution")}</h2></div>
              <div className="balance-head-summary">
                <span><small>{copy("Saldo inicial", "Opening balance")}</small><strong>{formatMoney(monthData?.opening_balance, language)}</strong></span>
                {isPastMonth ? (
                  <span><small>{copy("Saldo final", "Closing balance")}</small><strong>{formatMoney(closingBalance, language)}</strong></span>
                ) : isFutureMonth ? (
                  <span><small>{copy("Projeção", "Projection")}</small><strong>{formatMoney(safeSummary.projected_closing, language)}</strong></span>
                ) : (
                  <span><small>{copy("Saldo atual", "Current")}</small><strong>{formatMoney(safeSummary.current_balance, language)}</strong></span>
                )}
                <span className={movementClass(balanceVariation)}><small>{copy("Variação", "Change")}</small><strong><MovementIcon value={balanceVariation} />{formatMoney(balanceVariation, language)}</strong></span>
              </div>
            </div>
            {balanceChartData.length && hasBalanceActivity ? (
              <div className="dashboard-balance-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={balanceChartData} margin={{ top: 14, left: 4, right: 10, bottom: 0 }}>
                    <defs><linearGradient id="dashboardBalanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#14A078" stopOpacity={0.18} /><stop offset="100%" stopColor="#14A078" stopOpacity={0.01} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(value) => value.slice(-2)} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis domain={balanceDomain} tickFormatter={(value) => formatCompactMoney(value, language)} tickLine={false} axisLine={false} tickMargin={7} width={76} />
                    <Tooltip content={<BalanceTooltip language={language} />} />
                    {containsToday && <ReferenceLine x={todayIso} stroke="color-mix(in srgb, var(--primary) 55%, var(--border))" strokeDasharray="3 3" label={{ value: copy("Hoje", "Today"), position: "insideTopRight", fill: "var(--muted)", fontSize: 10 }} />}
                    <Area type="monotone" dataKey="realizedBalance" name={copy("Saldo realizado", "Actual balance")} stroke="#14A078" strokeWidth={3} fill="url(#dashboardBalanceFill)" connectNulls={false} dot={false} activeDot={{ r: 5 }} />
                    {containsProjection && <Line type="monotone" dataKey="projectedBalance" name={copy("Saldo projetado", "Projected balance")} stroke="#14A078" strokeWidth={2.5} strokeDasharray="6 5" strokeOpacity={0.58} dot={false} activeDot={{ r: 4 }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : <DashboardEmpty icon={TrendingUp} title={copy("Ainda não há evolução para exibir", "No balance trend to show yet")} description={copy("Adicione seu primeiro lançamento para acompanhar a evolução.", "Add your first entry to start tracking your balance.")} action={onNewTransaction} actionLabel={copy("Adicionar lançamento", "Add entry")} />}
          </section>

          <div className="dashboard-overview-lists">
            <section className="card dashboard-list-card">
              <div className="dashboard-card-head list-head"><div><p className="eyebrow">{copy("Agenda financeira", "Financial schedule")}</p><h2>{t("dashboard.upcomingDueDates")}</h2></div><span className="dashboard-head-total"><small>{copy("Total em aberto", "Open total")}</small><strong>{formatMoney(openInvoiceTotal, language)}</strong></span></div>
              {visibleInvoices.length ? <div className="dashboard-ranked-list">
                {visibleInvoices.map((invoice) => {
                  const days = getDaysUntil(invoice.due_date);
                  const urgency = days < 0 ? "overdue" : days <= 3 ? "urgent" : "";
                  return <div className={`dashboard-due-row ${urgency}`} key={invoice.id}><span className="dashboard-row-icon" style={{ "--row-color": invoice.color || "#14A078" }}><ReceiptText size={16} /></span><span className="dashboard-row-main"><strong>{invoice.name}</strong><small>{formatDateShort(invoice.due_date, language)} · {daysUntil(invoice.due_date, language)}</small></span><strong className="dashboard-row-value">{formatMoney(invoice.total_amount, language)}</strong></div>;
                })}
              </div> : <DashboardEmpty compact icon={CalendarClock} title={copy("Nenhum vencimento próximo", "No upcoming due dates")} description={copy("As próximas faturas em aberto aparecerão aqui.", "Your next open invoices will appear here.")} />}
              {openInvoices.length > 5 && <ShowMore expanded={showAllDueDates} onClick={() => setShowAllDueDates((current) => !current)} copy={copy} />}
            </section>

            <section className="card dashboard-list-card">
              <div className="dashboard-card-head list-head"><div><p className="eyebrow">{copy("Ranking do mês", "Monthly ranking")}</p><h2>{t("dashboard.biggestExpenses")}</h2></div><span className="dashboard-list-count">{allExpenses.length} {copy(allExpenses.length === 1 ? "gasto" : "gastos", allExpenses.length === 1 ? "expense" : "expenses")}</span></div>
              {visibleExpenses.length ? <div className="dashboard-ranked-list">
                {visibleExpenses.map((transaction, index) => {
                  const invoiceExpense = isInvoiceTransaction(transaction);
                  const categoryName = transaction.categories?.length ? transaction.categories.map((category) => category.name).join(" + ") : transaction.category?.name;
                  const context = invoiceExpense
                    ? copy("Fatura", "Invoice")
                    : ([categoryName, transaction.wallet?.name].filter(Boolean).join(" · ") || copy("Sem categoria", "Uncategorized"));
                  return <button className="dashboard-expense-row" type="button" onClick={() => onOpenTransaction?.(transaction)} key={transaction.id}><span className="dashboard-rank">{index + 1}</span><span className="dashboard-row-main"><strong>{transaction.description || t("dashboard.noDescription")}</strong><small>{context} · {formatDateShort(transaction.date, language)}</small><i><b style={{ width: `${(toNumber(transaction.amount) / maxExpense) * 100}%` }} /></i></span><strong className="dashboard-row-value expense">{formatMoney(transaction.amount, language)}</strong></button>;
                })}
              </div> : <DashboardEmpty compact icon={CircleDollarSign} title={copy("Nenhum gasto neste mês", "No expenses this month")} description={copy("Os maiores gastos aparecerão aqui após o primeiro lançamento.", "Your largest expenses will appear here after the first entry.")} />}
              {allExpenses.length > 5 && <ShowMore expanded={showAllExpenses} onClick={() => setShowAllExpenses((current) => !current)} copy={copy} />}
            </section>
          </div>
        </section>
      )}

      {activeSection === "wallets" && (
        <section className="dashboard-section" id="dashboard-panel-wallets" role="tabpanel" aria-labelledby="dashboard-tab-wallets">
          <DashboardWallets year={year ?? monthData?.year ?? safeSummary.year} month={month ?? monthData?.month ?? safeSummary.month} refreshKey={walletRefreshKey} dayTransactions={todayTransactions} />
        </section>
      )}

      {activeSection === "history" && (
        <section className="dashboard-section" id="dashboard-panel-history" role="tabpanel" aria-labelledby="dashboard-tab-history">
          {historyLoading ? <DashboardEmpty card icon={Clock3} title={copy("Carregando histórico", "Loading history")} description={copy("Os últimos meses estão sendo reunidos.", "The last months are being gathered.")} /> : historySummary && hasHistory ? <>
            <div className="dashboard-history-summary">
              <article className={`card ${movementClass(historySummary.variation)}`}><small>{copy("Variação do saldo", "Balance change")}</small><strong><MovementIcon value={historySummary.variation} />{formatMoney(historySummary.variation, language)}</strong></article>
              <article className="card income"><small>{copy("Média mensal de ganhos", "Average monthly income")}</small><strong>{formatMoney(historySummary.averageIncome, language)}</strong></article>
              <article className="card expense"><small>{copy("Média mensal de gastos", "Average monthly expenses")}</small><strong>{formatMoney(historySummary.averageExpenses, language)}</strong></article>
              <article className="card positive"><small>{copy("Melhor resultado", "Best result")} · {historySummary.best.label}</small><strong>{formatMoney(historySummary.best.result, language)}</strong></article>
              <article className="card negative"><small>{copy("Pior resultado", "Worst result")} · {historySummary.worst.label}</small><strong>{formatMoney(historySummary.worst.result, language)}</strong></article>
            </div>
            <section className="card chart-card dashboard-history-card">
              <div className="dashboard-card-head"><div><p className="eyebrow">{copy("Últimos seis meses", "Last six months")}</p><h2>{t("dashboard.monthlyHistory")}</h2></div><span className="dashboard-axis-hint"><i />{copy("Saldo final · eixo direito", "Final balance · right axis")}</span></div>
              <div className="dashboard-history-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={historyData} margin={{ top: 14, left: 0, right: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis yAxisId="flow" domain={historyFlowDomain} tickFormatter={(value) => formatCompactMoney(value, language)} tickLine={false} axisLine={false} tickMargin={6} width={72} />
                <YAxis yAxisId="balance" orientation="right" domain={historyBalanceDomain} tickFormatter={(value) => formatCompactMoney(value, language)} tickLine={false} axisLine={false} tickMargin={6} width={72} />
                <Tooltip content={<HistoryTooltip language={language} />} /><Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ paddingBottom: 12 }} />
                <Bar yAxisId="flow" dataKey="total_income" name={t("dashboard.income")} fill="#3CC88C" radius={[5, 5, 0, 0]} maxBarSize={28}>{historyData.map((item, index) => <Cell key={`income-${index}`} fill="#3CC88C" fillOpacity={item.selected ? 1 : 0.68} />)}</Bar>
                <Bar yAxisId="flow" dataKey="total_expenses" name={t("dashboard.expenses")} fill="#FF4D6A" radius={[5, 5, 0, 0]} maxBarSize={28}>{historyData.map((item, index) => <Cell key={`expense-${index}`} fill="#FF4D6A" fillOpacity={item.selected ? 1 : 0.68} />)}</Bar>
                <Line yAxisId="balance" type="monotone" dataKey="projected_closing" name={t("dashboard.finalBalance")} stroke="#256D5B" strokeWidth={2.5} dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                {historyData.length > 0 && <ReferenceLine yAxisId="flow" x={historyData.at(-1).label} stroke="color-mix(in srgb, var(--primary) 30%, transparent)" strokeWidth={8} strokeOpacity={0.18} />}
              </ComposedChart></ResponsiveContainer></div>
              <div className="dashboard-history-results" aria-label={copy("Resultados mensais", "Monthly results")}>{historyData.map((item) => <span className={movementClass(item.result)} key={item.label}><small>{item.label}</small><strong>{formatMoney(item.result, language)}</strong></span>)}</div>
            </section>
          </> : <DashboardEmpty card icon={TrendingUp} title={copy("Ainda não há histórico mensal", "No monthly history yet")} description={copy("Os comparativos aparecerão conforme novos meses forem registrados.", "Comparisons will appear as more months are recorded.")} />}
        </section>
      )}

      {activeSection === "categories" && (
        <section className="dashboard-section" id="dashboard-panel-categories" role="tabpanel" aria-labelledby="dashboard-tab-categories">
          <section className="card category-spending-card dashboard-category-card">
            <div className="category-spending-head"><div><p className="eyebrow">{copy("Visão por categoria", "Category view")}</p><h2>{viewingIncome ? copy("De onde seu dinheiro está vindo", "Where your money comes from") : copy("Para onde seu dinheiro está indo", "Where your money is going")}</h2></div><div className="category-view-actions"><div className="category-view-toggle" aria-label={copy("Tipo de movimentação", "Movement type")}><button className={viewingIncome ? "active" : ""} type="button" onClick={() => setCategoryView("income")}>{copy("Ganhos", "Income")}</button><button className={!viewingIncome ? "active" : ""} type="button" onClick={() => setCategoryView("expenses")}>{copy("Gastos", "Expenses")}</button></div><strong className={viewingIncome ? "income" : "expense"}>{formatMoney(categoryTotal, language)}</strong></div></div>
            {categoriesLoading && !categoryChartItems.length ? <DashboardEmpty icon={CircleDollarSign} title={copy("Carregando categorias", "Loading categories")} description={copy("A distribuição do mês está sendo calculada.", "This month's distribution is being calculated.")} /> : categoryChartItems.length ? <div className="category-spending-content dashboard-category-content">
              <div className="category-donut dashboard-category-donut" aria-label={copy("Distribuição por categoria", "Distribution by category")}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie className="categories-clickable-pie" data={categoryChartItems} dataKey="amount" nameKey="name" innerRadius="59%" outerRadius="84%" paddingAngle={2} stroke="none" onClick={(entry) => openCategoryDetails(entry?.payload || entry)}>{categoryChartItems.map((item) => <Cell className="dashboard-category-slice" key={expenseGroupKey(item)} fill={item.color} />)}</Pie><Tooltip content={<CategoryTooltip language={language} />} /></PieChart></ResponsiveContainer><div className="category-donut-center"><small>{viewingIncome ? copy("Ganhos", "Income") : copy("Total gasto", "Total spent")}</small><strong>{formatMoney(categoryGroupedTotal, language)}</strong></div></div>
              <div className="dashboard-category-ranking"><div className="dashboard-category-ranking-head"><span>{copy("Ranking de categorias", "Category ranking")}</span><small>{categoryItems.length} {copy(categoryItems.length === 1 ? "categoria" : "categorias", categoryItems.length === 1 ? "category" : "categories")}</small></div><div className="category-breakdown-list">
                {visibleCategoryItems.map((item, index) => <button className="category-breakdown-row" type="button" onClick={() => openCategoryDetails(item)} key={expenseGroupKey(item)}><span className="category-rank">{index + 1}</span><i style={{ "--category-color": item.color }} /><span><strong>{item.name}</strong><small>{toNumber(item.percentage).toFixed(1)}% {viewingIncome ? copy("dos ganhos", "of income") : copy("dos gastos", "of expenses")}</small><em><b style={{ width: `${(toNumber(item.amount) / maxCategory) * 100}%`, "--category-color": item.color }} /></em></span><strong>{formatMoney(item.amount, language)}</strong></button>)}
              </div>{categoryItems.length > 5 && <button className="dashboard-show-more" type="button" onClick={() => setShowAllCategories((current) => !current)}>{showAllCategories ? copy("Mostrar principais", "Show top categories") : copy("Ver todas as categorias", "View all categories")}<ArrowRight size={14} /></button>}</div>
            </div> : <DashboardEmpty icon={CircleDollarSign} title={viewingIncome ? copy("Nenhum ganho categorizado", "No categorized income") : copy("Nenhum gasto categorizado", "No categorized expenses")} description={copy(`Categorize suas próximas ${viewingIncome ? "receitas" : "despesas"} para visualizar a distribuição.`, `Categorize your next ${viewingIncome ? "income entries" : "expenses"} to see the distribution.`)} />}
          </section>
        </section>
      )}

      {selectedExpenseGroup && <CategoryExpenseDetailsModal group={selectedExpenseGroup} language={language} loading={expenseDetailsLoading} error={expenseDetailsError} income={viewingIncome} onClose={() => setSelectedExpenseGroup(null)} />}
      <button className="dashboard-new-fab" type="button" onClick={onNewTransaction} aria-label={copy("Novo lançamento", "New transaction")}><Plus size={24} /></button>
    </div>
  );
}

function DashboardEmpty({ icon: Icon, title, description, action, actionLabel, compact = false, card = false }) {
  return <div className={`${card ? "card " : ""}dashboard-empty-state${compact ? " compact" : ""}`}><Icon size={compact ? 20 : 22} /><strong>{title}</strong><span>{description}</span>{action && <button className="btn btn-primary compact" type="button" onClick={action}><Plus size={15} />{actionLabel}</button>}</div>;
}

function ShowMore({ expanded, onClick, copy }) {
  return <button className="dashboard-show-more" type="button" onClick={onClick}>{expanded ? copy("Mostrar menos", "Show less") : copy("Ver todos", "View all")}<ArrowRight size={14} /></button>;
}
