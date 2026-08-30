import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, ChevronDown, ChevronUp, Clock3, Loader2, PieChart as PieChartIcon, Plus, Save, ShieldCheck, Tags, Target, Trash2, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, parseTypedMoneyInput } from "../utils/format.js";

function changePercentage(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function moneyDraft(value, language) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safePercent(value, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, (value / total) * 100);
}

export default function CategoriesPage({
  categories = [],
  categoryBreakdown = { total_expenses: 0, items: [] },
  previousCategoryBreakdown = { total_expenses: 0, items: [] },
  budgetPlan = null,
  onUpdateCategory,
  onSavePlanning,
}) {
  const { t, language } = useI18n();
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [addingLimit, setAddingLimit] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [incomeMode, setIncomeMode] = useState("transactions");
  const [selectedIncomeIds, setSelectedIncomeIds] = useState([]);
  const [manualIncome, setManualIncome] = useState("");
  const [expectedIncome, setExpectedIncome] = useState("");
  const [reserveType, setReserveType] = useState("percentage");
  const [reserveValue, setReserveValue] = useState("0");

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map((category) => [category.id, moneyDraft(category.monthly_limit, language)])));
  }, [categories, language]);

  useEffect(() => {
    if (!budgetPlan) return;
    setIncomeMode(budgetPlan.income_mode || "transactions");
    setSelectedIncomeIds((budgetPlan.income_candidates || []).filter((item) => item.selected).map((item) => item.transaction_id));
    setManualIncome(moneyDraft(budgetPlan.manual_income, language));
    setExpectedIncome(moneyDraft(budgetPlan.expected_income, language));
    setReserveType(budgetPlan.reserve_rule?.rule_type || "percentage");
    setReserveValue(moneyDraft(budgetPlan.reserve_rule?.value ?? 0, language));
  }, [budgetPlan, language]);

  const currentById = useMemo(() => new Map((categoryBreakdown.items || []).map((item) => [item.category_id, Number(item.amount || 0)])), [categoryBreakdown.items]);
  const previousById = useMemo(() => new Map((previousCategoryBreakdown.items || []).map((item) => [item.category_id, Number(item.amount || 0)])), [previousCategoryBreakdown.items]);
  const rows = useMemo(() => categories.map((category) => {
    const spent = currentById.get(category.id) || 0;
    const previous = previousById.get(category.id) || 0;
    const limit = category.monthly_limit === null || category.monthly_limit === undefined ? null : Number(category.monthly_limit);
    return { ...category, spent, previous, limit, usage: limit > 0 ? (spent / limit) * 100 : null };
  }).sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name, language)), [categories, currentById, previousById, language]);

  const totalExpenses = Number(categoryBreakdown.total_expenses || 0);
  const previousExpenses = Number(previousCategoryBreakdown.total_expenses || 0);
  const uncategorized = currentById.get(null) || 0;
  const categorizedAmount = Math.max(totalExpenses - uncategorized, 0);
  const coverage = totalExpenses ? (categorizedAmount / totalExpenses) * 100 : 0;
  const budgetedRows = rows.filter((row) => row.limit > 0);
  const availableRows = rows.filter((row) => !row.limit || row.limit <= 0);
  const totalLimits = budgetedRows.reduce((sum, row) => sum + row.limit, 0);
  const overCategoryLimit = budgetedRows.filter((row) => row.spent > row.limit);
  const nearCategoryLimit = budgetedRows.filter((row) => row.spent <= row.limit && row.usage >= 80);
  const topCategory = rows.find((row) => row.spent > 0);
  const monthChange = changePercentage(totalExpenses, previousExpenses);
  const chartItems = (categoryBreakdown.items || []).filter((item) => Number(item.amount) > 0);

  const hasActualIncome = Boolean(budgetPlan?.has_actual_income);
  const isEstimated = Boolean(budgetPlan?.is_estimated);
  const hasPlannedIncome = hasActualIncome || isEstimated;
  const planningIncome = Number(budgetPlan?.planning_income || 0);
  const receivedIncome = Number(budgetPlan?.received_income || 0);
  const pendingIncome = Number(budgetPlan?.pending_income || 0);
  const hasPendingIncome = budgetPlan?.income_mode === "transactions" && pendingIncome > 0;
  const reserveAmount = Number(budgetPlan?.reserve_amount || 0);
  const availableBudget = Number(budgetPlan?.available_budget || 0);
  const budgetBalance = availableBudget - totalExpenses;
  const spendingUsage = hasPlannedIncome ? availableBudget > 0 ? safePercent(totalExpenses, availableBudget) : totalExpenses > 0 ? 100 : 0 : 0;
  const undistributedBudget = availableBudget - totalLimits;
  const limitsUsage = hasPlannedIncome ? availableBudget > 0 ? safePercent(totalLimits, availableBudget) : totalLimits > 0 ? 100 : 0 : 0;
  const limitsOverBudget = hasPlannedIncome && totalLimits > availableBudget;
  const budgetOverrun = hasActualIncome && totalExpenses > availableBudget;
  const selectedMonthEnded = budgetPlan ? new Date(budgetPlan.year, budgetPlan.month, 1) <= new Date() : false;

  const selectedCandidates = (budgetPlan?.income_candidates || []).filter((item) => selectedIncomeIds.includes(item.transaction_id));
  const draftTransactionIncome = selectedCandidates.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const draftManualIncome = parseTypedMoneyInput(manualIncome, language);
  const draftActualIncome = incomeMode === "manual" ? draftManualIncome : draftTransactionIncome;
  const draftExpectedIncome = parseTypedMoneyInput(expectedIncome, language);
  const draftPlanningIncome = draftActualIncome > 0 ? draftActualIncome : draftExpectedIncome;
  const draftReserveValue = parseTypedMoneyInput(reserveValue, language);
  const draftReserveRequested = reserveType === "percentage" ? draftPlanningIncome * Math.min(draftReserveValue, 100) / 100 : draftReserveValue;
  const draftReserveAmount = draftPlanningIncome > 0 ? Math.min(draftReserveRequested, draftPlanningIncome) : 0;
  const reserveInputValid = reserveType !== "percentage" || draftReserveValue <= 100;

  const saveLimit = async (category) => {
    const parsed = parseTypedMoneyInput(String(drafts[category.id] ?? "").trim(), language);
    setSavingId(category.id);
    try { await onUpdateCategory(category.id, { monthly_limit: parsed > 0 ? parsed : null }); }
    finally { setSavingId(null); }
  };
  const openLimitForm = () => {
    if (!availableRows.length) return;
    setSelectedCategoryId(String(availableRows[0].id));
    setNewLimit("");
    setAddingLimit(true);
  };
  const closeLimitForm = () => { setAddingLimit(false); setSelectedCategoryId(""); setNewLimit(""); };
  const addLimit = async () => {
    const category = availableRows.find((row) => row.id === Number(selectedCategoryId));
    const value = parseTypedMoneyInput(newLimit, language);
    if (!category || value <= 0) return;
    setSavingId("new");
    try { await onUpdateCategory(category.id, { monthly_limit: value }); closeLimitForm(); }
    finally { setSavingId(null); }
  };
  const removeLimit = async (category) => {
    setSavingId(category.id);
    try { await onUpdateCategory(category.id, { monthly_limit: null }); }
    finally { setSavingId(null); }
  };
  const toggleIncome = (id) => setSelectedIncomeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const savePlanning = async () => {
    if (!reserveInputValid || planningSaving) return;
    setPlanningSaving(true);
    try {
      await onSavePlanning({ income_mode: incomeMode, manual_income: manualIncome.trim() ? draftManualIncome : null, expected_income: expectedIncome.trim() ? draftExpectedIncome : null, transaction_ids: selectedIncomeIds }, { rule_type: reserveType, value: draftReserveValue });
      setPlanningOpen(false);
    } finally { setPlanningSaving(false); }
  };

  return (
    <div className="categories-page">
      <section className="card categories-hero">
        <div className="categories-hero-icon"><Tags size={25} /></div>
        <div><p className="eyebrow">{t("categories.eyebrow")}</p><h1>{t("categories.title")}</h1><p>{t("categories.description")}</p></div>
        <div className="categories-hero-total"><span>{t("categories.totalThisMonth")}</span><strong>{formatMoney(totalExpenses, language)}</strong><small className={monthChange > 0 ? "warning" : "positive"}>{monthChange > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{t("categories.vsPrevious", { value: Math.abs(monthChange).toFixed(1) })}</small></div>
      </section>

      <section className={`card categories-planning-card ${isEstimated ? "estimated" : ""}`}>
        <div className="categories-planning-heading">
          <div><p className="eyebrow">{t("categories.monthPlanningEyebrow")}</p><h2>{t("categories.monthPlanning")}</h2></div>
          <span className={`categories-planning-status ${isEstimated ? "estimated" : hasActualIncome ? "actual" : "waiting"}`}>{!isEstimated && hasActualIncome ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{hasPendingIncome ? t("categories.planningWithPending") : isEstimated ? t("categories.estimatedStatus") : hasActualIncome ? t("categories.incomeReceivedStatus") : t("categories.waitingIncome")}</span>
        </div>
        <div className="categories-planning-flow">
          <div className="categories-flow-step income"><i><Banknote size={20} /></i><span><small>{hasPendingIncome ? t("categories.plannedIncome") : hasActualIncome ? t("categories.incomeReceived") : isEstimated ? t("categories.expectedIncome") : t("categories.monthIncome")}</small><strong>{hasPlannedIncome ? formatMoney(planningIncome, language) : "—"}</strong><em>{hasPendingIncome ? t("categories.receivedPendingBreakdown", { received: formatMoney(receivedIncome, language), pending: formatMoney(pendingIncome, language) }) : hasActualIncome ? budgetPlan?.income_mode === "manual" ? t("categories.manualIncomeSource") : t("categories.selectedReceipts", { count: budgetPlan?.selected_income_count || 0 }) : isEstimated ? t("categories.estimatedValue") : t("categories.noIncomeSelected")}</em></span></div>
          <ArrowRight className="categories-flow-arrow" size={20} />
          <div className="categories-flow-step reserve"><i><ShieldCheck size={20} /></i><span><small>{isEstimated ? t("categories.estimatedReserve") : t("categories.reserve")}</small><strong>{hasPlannedIncome ? formatMoney(reserveAmount, language) : "—"}</strong><em>{budgetPlan?.reserve_rule?.rule_type === "fixed" ? t("categories.fixedRule") : t("categories.percentageRule", { value: Number(budgetPlan?.reserve_rule?.value || 0).toFixed(0) })}</em></span></div>
          <ArrowRight className="categories-flow-arrow" size={20} />
          <div className="categories-flow-step available"><i><WalletCards size={20} /></i><span><small>{isEstimated ? t("categories.estimatedAvailable") : t("categories.availableToSpend")}</small><strong>{hasPlannedIncome ? formatMoney(availableBudget, language) : "—"}</strong><em>{hasPlannedIncome ? t("categories.afterReserve") : t("categories.budgetNotDefined")}</em></span></div>
        </div>
        <div className="categories-planning-footer"><p>{budgetPlan?.reserve_capped ? t("categories.reserveCapped") : isEstimated ? t("categories.expectedIncomeDisclaimer") : !hasActualIncome ? t("categories.noIncomeExplanation") : t("categories.actualIncomeExplanation")}</p><button className="btn compact" type="button" onClick={() => setPlanningOpen((value) => !value)}>{planningOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{planningOpen ? t("categories.closePlanning") : t("categories.changePlanning")}</button></div>

        {planningOpen && (
          <div className="categories-planning-editor">
            <div className="categories-income-editor">
              <div className="categories-editor-heading"><div><strong>{t("categories.incomeSource")}</strong><small>{t("categories.incomeSourceHint")}</small></div><div className="category-view-toggle"><button className={incomeMode === "transactions" ? "active" : ""} type="button" onClick={() => setIncomeMode("transactions")}>{t("categories.useTransactions")}</button><button className={incomeMode === "manual" ? "active" : ""} type="button" onClick={() => setIncomeMode("manual")}>{t("categories.enterManually")}</button></div></div>
              {incomeMode === "transactions" ? (
                <div className="categories-income-candidates">
                  <span>{t("categories.incomeFound")}</span>
                  {(budgetPlan?.income_candidates || []).length ? budgetPlan.income_candidates.map((item) => (
                    <label key={item.transaction_id} className={`categories-income-candidate ${item.received ? "" : "awaiting"}`}>
                      <input type="checkbox" checked={selectedIncomeIds.includes(item.transaction_id)} onChange={() => toggleIncome(item.transaction_id)} />
                      <span>
                        <strong>{item.description || t("categories.incomeWithoutDescription")}</strong>
                        <small>{formatDateShort(item.date, language)} · {item.received ? t("categories.receivedStatus") : t("categories.awaitingReceipt")}</small>
                      </span>
                      <strong>{formatMoney(item.amount, language)}</strong>
                    </label>
                  )) : <div className="categories-income-empty"><Clock3 size={18} /><span><strong>{t("categories.noIncomeTransactions")}</strong><small>{t("categories.noIncomeTransactionsHint")}</small></span></div>}
                  <div className="categories-income-total"><span>{t("categories.consideredTotal")}</span><strong>{formatMoney(draftTransactionIncome, language)}</strong></div>
                </div>
              ) : <div className="categories-manual-income"><label><span>{t("categories.manualAvailableIncome")}</span><span className="categories-money-field"><span>R$</span><input inputMode="decimal" placeholder="0,00" value={manualIncome} onChange={(event) => setManualIncome(event.target.value)} /></span><small>{t("categories.manualIncomeHint")}</small></label></div>}
              <div className="categories-expected-income"><label><span>{t("categories.expectedIncomeOptional")}</span><span className="categories-money-field"><span>R$</span><input inputMode="decimal" placeholder="0,00" value={expectedIncome} onChange={(event) => setExpectedIncome(event.target.value)} /></span></label><p><Clock3 size={15} /> {t("categories.expectedIncomeHint")}</p></div>
            </div>
            <div className="categories-reserve-editor">
              <div className="categories-editor-heading"><div><strong>{t("categories.reserveRule")}</strong><small>{t("categories.reserveRuleHint")}</small></div><div className="category-view-toggle"><button className={reserveType === "percentage" ? "active" : ""} type="button" onClick={() => setReserveType("percentage")}>{t("categories.percentage")}</button><button className={reserveType === "fixed" ? "active" : ""} type="button" onClick={() => setReserveType("fixed")}>{t("categories.fixedValue")}</button></div></div>
              <div className="categories-reserve-input">
                {reserveType === "percentage" ? <label><span>{t("categories.wantReserve")}</span><span className="categories-percent-field"><input inputMode="decimal" value={reserveValue} onChange={(event) => setReserveValue(event.target.value)} /><b>%</b></span><span>{t("categories.ofIncome")}</span></label> : <label><span>{t("categories.wantReserve")}</span><span className="categories-money-field"><span>R$</span><input inputMode="decimal" value={reserveValue} onChange={(event) => setReserveValue(event.target.value)} /></span><span>{t("categories.perMonth")}</span></label>}
                {!reserveInputValid && <small className="field-error">{t("categories.invalidReservePercentage")}</small>}
                {draftPlanningIncome > 0 ? <p>{draftActualIncome <= 0 ? t("categories.estimatedCalculation") : t("categories.currentIncomeCalculation")} <strong>{formatMoney(draftReserveAmount, language)}</strong>{reserveType === "fixed" && draftActualIncome > 0 ? ` · ${safePercent(draftReserveAmount, draftActualIncome).toFixed(1)}%` : ""}</p> : <p>{t("categories.reserveWithoutIncome")}</p>}
              </div>
            </div>
            <div className="categories-planning-actions"><button className="btn btn-ghost" type="button" onClick={() => setPlanningOpen(false)}>{t("actions.cancel")}</button><button className="btn btn-primary" type="button" disabled={!reserveInputValid || planningSaving} onClick={savePlanning}>{planningSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} {t("categories.savePlanning")}</button></div>
          </div>
        )}
      </section>

      <section className="card categories-usage-card">
        <div className="categories-card-heading"><div><p className="eyebrow">{t("categories.moneyUsageEyebrow")}</p><h2>{t("categories.moneyUsage")}</h2></div>{isEstimated && <span className="categories-estimate-badge"><Clock3 size={13} /> {t("categories.estimate")}</span>}</div>
        <div className="categories-usage-values"><div><span>{isEstimated ? t("categories.estimatedBudget") : t("categories.availableBudget")}</span><strong>{hasPlannedIncome ? formatMoney(availableBudget, language) : "—"}</strong></div><div><span>{t("categories.registeredExpenses")}</span><strong>{formatMoney(totalExpenses, language)}</strong></div><div className={hasActualIncome && budgetBalance < 0 ? "negative" : ""}><span>{isEstimated ? t("categories.estimatedBalance") : t("categories.budgetBalance")}</span><strong>{hasPlannedIncome ? formatMoney(budgetBalance, language) : "—"}</strong></div></div>
        {hasPlannedIncome ? <div className={`categories-usage-progress ${budgetOverrun ? "danger" : spendingUsage >= 80 ? "warning" : ""}`}><div><span style={{ width: `${Math.min(spendingUsage, 100)}%` }} /></div><p><span>{t("categories.usedBudget", { spent: formatMoney(totalExpenses, language), budget: formatMoney(availableBudget, language) })}</span><strong>{spendingUsage.toFixed(1)}%</strong></p></div> : <div className="categories-budget-undefined"><Clock3 size={17} /><span><strong>{t("categories.budgetNotDefined")}</strong><small>{t("categories.expensesBeforeBudget", { value: formatMoney(totalExpenses, language) })}</small></span></div>}
        {selectedMonthEnded && hasActualIncome && budgetBalance > 0 && <div className="categories-month-remainder"><div><CheckCircle2 size={17} /><span><strong>{t("categories.unusedAtMonthEnd", { value: formatMoney(budgetBalance, language) })}</strong><small>{t("categories.remainderKeptNeutral")}</small></span></div><div><button className="btn compact" type="button" disabled>{t("categories.carryNextMonth")}</button><button className="btn compact" type="button" disabled>{t("categories.addToReserve")}</button></div></div>}
      </section>

      <section className="card categories-budget-card">
        <div className="categories-card-heading categories-budget-heading"><div><p className="eyebrow">{t("categories.limitsEyebrow")}</p><h2>{t("categories.limits")}</h2><span>{t("categories.limitsDescription")}</span></div><div className="categories-budget-heading-actions"><small>{t("categories.configuredCount", { configured: budgetedRows.length, total: categories.length })}</small>{categories.length > 0 && <button className="btn compact" type="button" onClick={openLimitForm} disabled={addingLimit || !availableRows.length}><Plus size={15} /> {t("categories.addLimit")}</button>}</div></div>
        <div className={`categories-limit-allocation ${limitsOverBudget ? hasActualIncome ? "danger" : "warning" : ""}`}><div><span>{isEstimated ? t("categories.estimatedBudget") : t("categories.availableBudget")}</span><strong>{hasPlannedIncome ? formatMoney(availableBudget, language) : "—"}</strong></div><ArrowRight size={17} /><div><span>{t("categories.distributedLimits")}</span><strong>{formatMoney(totalLimits, language)}</strong></div><ArrowRight size={17} /><div><span>{limitsOverBudget ? t("categories.aboveBudget") : t("categories.notDistributed")}</span><strong>{hasPlannedIncome ? formatMoney(Math.abs(undistributedBudget), language) : "—"}</strong></div><div className="categories-allocation-progress"><div><span style={{ width: `${Math.min(limitsUsage, 100)}%` }} /></div><small>{hasPlannedIncome ? t("categories.distributedBudget", { limits: formatMoney(totalLimits, language), budget: formatMoney(availableBudget, language), value: limitsUsage.toFixed(0) }) : t("categories.defineBudgetToCompare")}</small></div></div>
        {limitsOverBudget && <div className={`categories-allocation-alert ${hasActualIncome ? "danger" : "warning"}`}><AlertTriangle size={16} /> {isEstimated ? t("categories.limitsAboveEstimate", { value: formatMoney(totalLimits - availableBudget, language) }) : t("categories.limitsAboveBudget", { value: formatMoney(totalLimits - availableBudget, language) })}</div>}
        {addingLimit && <div className="categories-limit-add"><div className="categories-limit-add-title"><i><Plus size={17} /></i><span><strong>{t("categories.newLimit")}</strong><small>{t("categories.newLimitHint")}</small></span></div><label className="categories-limit-add-field"><span>{t("categories.chooseCategory")}</span><select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>{availableRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className="categories-limit-add-field"><span>{t("categories.monthlyLimit")}</span><label className="categories-money-field"><span>R$</span><input autoFocus inputMode="decimal" aria-label={t("categories.monthlyLimit")} placeholder="0,00" value={newLimit} onChange={(event) => setNewLimit(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLimit(); } }} /></label></div><div className="categories-limit-add-actions"><button className="icon-btn" type="button" onClick={closeLimitForm} aria-label={t("actions.cancel")}><X size={17} /></button><button className="btn btn-primary" type="button" disabled={!selectedCategoryId || parseTypedMoneyInput(newLimit, language) <= 0 || savingId === "new"} onClick={addLimit}>{savingId === "new" ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} {t("categories.confirmAdd")}</button></div></div>}
        {budgetedRows.length ? <div className="categories-budget-list">{budgetedRows.map((row) => { const status = row.usage > 100 ? "danger" : row.usage >= 80 ? "warning" : "success"; const changed = String(drafts[row.id] ?? "").trim() !== moneyDraft(row.monthly_limit, language); return <div className="categories-budget-row" key={row.id}><div className="categories-budget-name"><i style={{ "--category-color": row.color }} /><span><strong>{row.name}</strong><small>{formatMoney(row.spent, language)} {t("categories.spent")}</small></span></div><div className={`categories-budget-progress ${status}`}><div><span style={{ width: `${Math.min(row.usage, 100)}%` }} /></div><small>{Math.round(row.usage)}%</small></div><div className="categories-limit-form"><label className="categories-money-field"><span>R$</span><input inputMode="decimal" aria-label={t("categories.limitFor", { name: row.name })} value={drafts[row.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveLimit(row); } }} /></label><div className="categories-limit-actions"><button className="icon-btn small" type="button" disabled={!changed || savingId === row.id} onClick={() => saveLimit(row)} aria-label={t("categories.saveLimit")}>{savingId === row.id ? <Loader2 className="spin" size={15} /> : <Save size={15} />}</button><button className="icon-btn small danger" type="button" disabled={savingId === row.id} onClick={() => removeLimit(row)} aria-label={t("categories.removeLimit")}><Trash2 size={15} /></button></div></div></div>; })}</div> : !addingLimit && <div className="categories-empty categories-limits-empty"><Target size={30} /><strong>{categories.length ? t("categories.noLimitsTitle") : t("categories.noCategories")}</strong>{categories.length > 0 && <><p>{t("categories.noLimitsHint")}</p><button className="btn btn-primary compact" type="button" onClick={openLimitForm}><Plus size={15} /> {t("categories.addFirstLimit")}</button></>}</div>}
      </section>

      <section className="categories-main-grid">
        <article className="card categories-chart-card"><div className="categories-card-heading"><div><p className="eyebrow">{t("categories.distributionEyebrow")}</p><h2>{t("categories.distribution")}</h2></div><div className="categories-analysis-meta"><span>{t("categories.classified")}</span><strong>{coverage.toFixed(0)}%</strong></div></div>{chartItems.length ? <><div className="categories-donut"><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={chartItems} dataKey="amount" nameKey="name" innerRadius={72} outerRadius={105} paddingAngle={2} stroke="none">{chartItems.map((item) => <Cell key={item.category_id ?? "uncategorized"} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(value, language)} /></PieChart></ResponsiveContainer><div><span>{t("categories.total")}</span><strong>{formatMoney(totalExpenses, language)}</strong></div></div><div className="categories-legend">{chartItems.map((item) => <div key={item.category_id ?? "uncategorized"}><i style={{ "--category-color": item.color }} /><span><strong>{item.name}</strong><small>{Number(item.percentage).toFixed(1)}%</small></span><strong>{formatMoney(item.amount, language)}</strong></div>)}</div>{topCategory && <div className="categories-top-category"><TrendingUp size={15} /><span>{t("categories.biggestExpense")}: <strong>{topCategory.name}</strong></span><strong>{formatMoney(topCategory.spent, language)}</strong></div>}</> : <div className="categories-empty"><PieChartIcon size={30} /><p>{t("categories.empty")}</p></div>}</article>
        <article className="card categories-insights-card"><div className="categories-card-heading"><div><p className="eyebrow">{t("categories.insightsEyebrow")}</p><h2>{t("categories.insights")}</h2></div></div><div className="categories-insights-list">{overCategoryLimit.length > 0 && <div className="categories-insight danger"><AlertTriangle size={19} /><span><strong>{t("categories.overLimitCount", { count: overCategoryLimit.length })}</strong><small>{overCategoryLimit.map((row) => row.name).join(", ")}</small></span></div>}{nearCategoryLimit.length > 0 && <div className="categories-insight warning"><Target size={19} /><span><strong>{t("categories.nearLimitCount", { count: nearCategoryLimit.length })}</strong><small>{nearCategoryLimit.map((row) => row.name).join(", ")}</small></span></div>}{uncategorized > 0 && <div className="categories-insight neutral"><Tags size={19} /><span><strong>{t("categories.uncategorizedValue", { value: formatMoney(uncategorized, language) })}</strong><small>{t("categories.uncategorizedHint")}</small></span></div>}{monthChange !== 0 && <div className={`categories-insight ${monthChange > 0 ? "warning" : "success"}`}>{monthChange > 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />}<span><strong>{monthChange > 0 ? t("categories.spendingIncreased", { value: Math.abs(monthChange).toFixed(1) }) : t("categories.spendingDecreased", { value: Math.abs(monthChange).toFixed(1) })}</strong><small>{t("categories.previousTotal", { value: formatMoney(previousExpenses, language) })}</small></span></div>}{!hasPlannedIncome && totalExpenses > 0 && <div className="categories-insight neutral"><WalletCards size={19} /><span><strong>{t("categories.budgetNotDefined")}</strong><small>{t("categories.expensesBeforeBudget", { value: formatMoney(totalExpenses, language) })}</small></span></div>}{!overCategoryLimit.length && !nearCategoryLimit.length && !uncategorized && monthChange === 0 && <div className="categories-insight success"><CheckCircle2 size={19} /><span><strong>{t("categories.allGood")}</strong><small>{t("categories.allGoodHint")}</small></span></div>}</div></article>
      </section>
    </div>
  );
}
