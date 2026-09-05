import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, Banknote, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock3, CreditCard, Loader2, PieChart as PieChartIcon, Plus, ReceiptText, Save, ShieldCheck, Tags, Target, Trash2, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
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

function expenseGroupKey(item) {
  return item?.category_ids?.length
    ? [...item.category_ids].sort((left, right) => left - right).join("-")
    : "uncategorized";
}

function buildVisibleExpenseGroups(items, categories, ignoredCategoryIds) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const grouped = new Map();
  for (const item of items || []) {
    const sourceIds = item.category_ids?.length
      ? item.category_ids
      : item.category_id !== null && item.category_id !== undefined
        ? [item.category_id]
        : [];
    const visibleIds = sourceIds.filter((categoryId) => !ignoredCategoryIds.has(categoryId));
    if (sourceIds.length && !visibleIds.length) continue;
    const key = visibleIds.length ? [...visibleIds].sort((left, right) => left - right).join("-") : "uncategorized";
    const groupCategories = visibleIds.map((categoryId) => categoriesById.get(categoryId)).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
    const existing = grouped.get(key);
    if (existing) {
      existing.amount += Number(item.amount || 0);
      existing.details.push(...(item.details || []));
    } else {
      grouped.set(key, {
        category_id: visibleIds.length === 1 ? visibleIds[0] : null,
        category_ids: groupCategories.map((category) => category.id),
        name: groupCategories.length ? groupCategories.map((category) => category.name).join(" + ") : item.name,
        color: groupCategories[0]?.color || item.color,
        amount: Number(item.amount || 0),
        details: [...(item.details || [])],
      });
    }
  }
  const result = [...grouped.values()].filter((item) => item.amount !== 0);
  const total = result.reduce((sum, item) => sum + item.amount, 0);
  return result
    .map((item) => ({
      ...item,
      percentage: total > 0 ? (item.amount / total) * 100 : 0,
      details: [...(item.details || [])].sort((left, right) => {
        const byDate = String(right.date || "").localeCompare(String(left.date || ""));
        return byDate || Number(right.source_id || 0) - Number(left.source_id || 0);
      }),
    }))
    .sort((left, right) => right.amount - left.amount);
}

function CategoryExpenseDetails({ group, categories, language, loading, error, income = false, onClose }) {
  const details = group.details || [];
  const groupCategories = (group.category_ids || []).map((categoryId) => categories.find((category) => category.id === categoryId)).filter(Boolean);
  const average = details.length ? Number(group.amount || 0) / details.length : 0;
  const text = language === "en-US"
    ? income
      ? { eyebrow: "Income details", total: "Group total", entries: "entries", average: "Average income", empty: "No income details available.", loading: "Loading income…", error: "Could not load the income details.", standalone: "Standalone entry", invoice: "Invoice", installment: "Installment" }
      : { eyebrow: "Expense details", total: "Group total", entries: "entries", average: "Average expense", empty: "No expense details available.", loading: "Loading expenses…", error: "Could not load the expense details.", standalone: "Standalone entry", invoice: "Invoice", installment: "Installment" }
    : income
      ? { eyebrow: "Detalhes dos ganhos", total: "Total do grupo", entries: "lançamentos", average: "Ganho médio", empty: "Nenhum ganho disponível neste grupo.", loading: "Carregando ganhos…", error: "Não foi possível carregar os detalhes dos ganhos.", standalone: "Lançamento avulso", invoice: "Fatura", installment: "Parcela" }
      : { eyebrow: "Detalhes dos gastos", total: "Total do grupo", entries: "lançamentos", average: "Gasto médio", empty: "Nenhum detalhe disponível para este grupo.", loading: "Carregando lançamentos…", error: "Não foi possível carregar os detalhes dos gastos.", standalone: "Lançamento avulso", invoice: "Fatura", installment: "Parcela" };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-layer categories-detail-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close details" : "Fechar detalhes"} />
      <section className="modal-card categories-detail-modal" role="dialog" aria-modal="true" aria-labelledby="category-expense-detail-title">
        <header className="categories-detail-header" style={{ "--category-color": group.color }}>
          <i><Tags size={20} /></i>
          <div><p className="eyebrow">{text.eyebrow}</p><h2 id="category-expense-detail-title">{group.name}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close" : "Fechar"}><X size={18} /></button>
        </header>

        {groupCategories.length > 0 && <div className="categories-detail-tags">{groupCategories.map((category) => <span key={category.id} style={{ "--category-color": category.color }}><i />{category.name}</span>)}</div>}

        <div className="categories-detail-summary">
          <div><small>{text.total}</small><strong>{formatMoney(group.amount, language)}</strong><span>{Number(group.percentage || 0).toFixed(1)}% {language === "en-US" ? "of the month" : "do mês"}</span></div>
          <div><small>{language === "en-US" ? "Composition" : "Composição"}</small><strong>{loading ? "—" : details.length}</strong><span>{text.entries}</span></div>
          <div><small>{text.average}</small><strong>{loading ? "—" : formatMoney(average, language)}</strong><span>{language === "en-US" ? "per entry" : "por lançamento"}</span></div>
        </div>

        <div className="categories-detail-list">
          {loading ? <div className="categories-detail-status"><Loader2 className="spin" size={22} /><span>{text.loading}</span></div> : error ? <div className="categories-detail-status error"><AlertTriangle size={22} /><span>{text.error}</span></div> : details.length ? details.map((detail) => {
            const installment = detail.source_type === "installment_item";
            const invoice = detail.source_type === "invoice_item";
            const SourceIcon = installment || invoice ? CreditCard : ReceiptText;
            const origin = installment
              ? `${detail.invoice_name ? `${text.invoice} ${detail.invoice_name} · ` : ""}${text.installment} ${detail.installment_number}/${detail.installment_count}`
              : invoice
                ? `${text.invoice} ${detail.invoice_name || ""}`.trim()
                : text.standalone;
            return (
              <article className="categories-detail-item" key={`${detail.source_type}-${detail.source_id}`}>
                <i><SourceIcon size={17} /></i>
                <span><strong>{detail.description}</strong><small><CalendarDays size={12} /> {formatDateShort(detail.date, language)}<em>·</em>{origin}</small></span>
                <strong className={income ? "income" : Number(detail.amount) < 0 ? "refund" : ""}>{formatMoney(detail.amount, language)}</strong>
              </article>
            );
          }) : <div className="categories-detail-empty"><ReceiptText size={22} /><span>{text.empty}</span></div>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function CategoryChartTooltip({ active, payload, language }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="categories-chart-tooltip" style={{ "--category-color": item.color }}>
      <div><i /><strong>{item.name}</strong></div>
      <span>{formatMoney(item.amount, language)}</span>
      <small>{Number(item.percentage || 0).toFixed(1)}% {language === "en-US" ? "of total · Click for details" : "do total · Clique para ver detalhes"}</small>
    </div>
  );
}

export default function CategoriesPage({
  categories = [],
  categoryBreakdown = { total_expenses: 0, items: [], chart_items: [], total_income: 0, income_items: [], income_chart_items: [] },
  previousCategoryBreakdown = { total_expenses: 0, items: [], chart_items: [], total_income: 0, income_items: [], income_chart_items: [] },
  budgetPlan = null,
  onLoadExpenseDetails,
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
  const [reserveIncomeIds, setReserveIncomeIds] = useState([]);
  const [expandedIncomeGroups, setExpandedIncomeGroups] = useState([]);
  const [expandedReserveIncomeGroups, setExpandedReserveIncomeGroups] = useState([]);
  const [manualIncome, setManualIncome] = useState("");
  const [expectedIncome, setExpectedIncome] = useState("");
  const [reserveType, setReserveType] = useState("percentage");
  const [reserveValue, setReserveValue] = useState("0");
  const [categoryAnalysisView, setCategoryAnalysisView] = useState("expenses");
  const [selectedExpenseGroup, setSelectedExpenseGroup] = useState(null);
  const [detailedExpenseGroups, setDetailedExpenseGroups] = useState(null);
  const [expenseDetailsLoading, setExpenseDetailsLoading] = useState(false);
  const [expenseDetailsError, setExpenseDetailsError] = useState(false);
  const detailsRequestRef = useRef(null);
  const detailsGenerationRef = useRef(0);

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map((category) => [category.id, moneyDraft(category.monthly_limit, language)])));
  }, [categories, language]);

  useEffect(() => {
    if (!budgetPlan) return;
    setIncomeMode(budgetPlan.income_mode || "transactions");
    setSelectedIncomeIds((budgetPlan.income_candidates || []).filter((item) => item.selected).map((item) => item.transaction_id));
    setReserveIncomeIds((budgetPlan.income_candidates || []).filter((item) => item.selected && item.included_in_reserve !== false).map((item) => item.transaction_id));
    setExpandedIncomeGroups([]);
    setExpandedReserveIncomeGroups([]);
    setManualIncome(moneyDraft(budgetPlan.manual_income, language));
    setExpectedIncome(moneyDraft(budgetPlan.expected_income, language));
    setReserveType(budgetPlan.reserve_rule?.rule_type || "percentage");
    setReserveValue(moneyDraft(budgetPlan.reserve_rule?.value ?? 0, language));
  }, [budgetPlan, language]);

  useEffect(() => {
    detailsGenerationRef.current += 1;
    setSelectedExpenseGroup(null);
    setDetailedExpenseGroups(null);
    setExpenseDetailsLoading(false);
    setExpenseDetailsError(false);
    detailsRequestRef.current = null;
  }, [categoryBreakdown, categoryAnalysisView]);

  const ignoredCategoryIds = useMemo(() => new Set(categories.filter((category) => category.ignore_in_category_analysis).map((category) => category.id)), [categories]);
  const visibleCategories = useMemo(() => categories.filter((category) => !ignoredCategoryIds.has(category.id)), [categories, ignoredCategoryIds]);
  const currentItems = useMemo(() => (categoryBreakdown.items || []).filter((item) => !ignoredCategoryIds.has(item.category_id)), [categoryBreakdown.items, ignoredCategoryIds]);
  const previousItems = useMemo(() => (previousCategoryBreakdown.items || []).filter((item) => !ignoredCategoryIds.has(item.category_id)), [previousCategoryBreakdown.items, ignoredCategoryIds]);
  const currentChartItems = useMemo(() => buildVisibleExpenseGroups(categoryBreakdown.chart_items || categoryBreakdown.items, categories, ignoredCategoryIds), [categoryBreakdown.chart_items, categoryBreakdown.items, categories, ignoredCategoryIds]);
  const previousChartItems = useMemo(() => buildVisibleExpenseGroups(previousCategoryBreakdown.chart_items || previousCategoryBreakdown.items, categories, ignoredCategoryIds), [previousCategoryBreakdown.chart_items, previousCategoryBreakdown.items, categories, ignoredCategoryIds]);
  const currentIncomeChartItems = useMemo(() => buildVisibleExpenseGroups(categoryBreakdown.income_chart_items || categoryBreakdown.income_items, categories, ignoredCategoryIds), [categoryBreakdown.income_chart_items, categoryBreakdown.income_items, categories, ignoredCategoryIds]);
  const previousIncomeChartItems = useMemo(() => buildVisibleExpenseGroups(previousCategoryBreakdown.income_chart_items || previousCategoryBreakdown.income_items, categories, ignoredCategoryIds), [previousCategoryBreakdown.income_chart_items, previousCategoryBreakdown.income_items, categories, ignoredCategoryIds]);
  const currentById = useMemo(() => new Map(currentItems.map((item) => [item.category_id, Number(item.amount || 0)])), [currentItems]);
  const previousById = useMemo(() => new Map(previousItems.map((item) => [item.category_id, Number(item.amount || 0)])), [previousItems]);
  const rows = useMemo(() => visibleCategories.map((category) => {
    const spent = currentById.get(category.id) || 0;
    const previous = previousById.get(category.id) || 0;
    const limit = category.monthly_limit === null || category.monthly_limit === undefined ? null : Number(category.monthly_limit);
    return { ...category, spent, previous, limit, usage: limit > 0 ? (spent / limit) * 100 : null };
  }).sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name, language)), [visibleCategories, currentById, previousById, language]);

  const openCategoryDetails = async (group) => {
    const generation = detailsGenerationRef.current;
    const key = expenseGroupKey(group);
    const cachedGroup = detailedExpenseGroups?.find((item) => expenseGroupKey(item) === key);
    setSelectedExpenseGroup(cachedGroup || group);
    setExpenseDetailsError(false);
    if (cachedGroup || !onLoadExpenseDetails) return;

    setExpenseDetailsLoading(true);
    try {
      const request = detailsRequestRef.current || onLoadExpenseDetails();
      detailsRequestRef.current = request;
      const breakdown = await request;
      if (generation !== detailsGenerationRef.current) return;
      const loadedGroups = buildVisibleExpenseGroups(categoryAnalysisView === "income" ? breakdown.income_chart_items || breakdown.income_items : breakdown.chart_items || breakdown.items, categories, ignoredCategoryIds);
      setDetailedExpenseGroups(loadedGroups);
      setSelectedExpenseGroup((current) => {
        if (!current) return null;
        return loadedGroups.find((item) => expenseGroupKey(item) === expenseGroupKey(current)) || current;
      });
    } catch {
      if (generation !== detailsGenerationRef.current) return;
      detailsRequestRef.current = null;
      setExpenseDetailsError(true);
    } finally {
      if (generation === detailsGenerationRef.current) setExpenseDetailsLoading(false);
    }
  };

  const totalExpenses = Math.max(currentChartItems.reduce((sum, item) => sum + item.amount, 0), 0);
  const previousExpenses = Math.max(previousChartItems.reduce((sum, item) => sum + item.amount, 0), 0);
  const totalIncome = Math.max(currentIncomeChartItems.reduce((sum, item) => sum + item.amount, 0), 0);
  const previousIncome = Math.max(previousIncomeChartItems.reduce((sum, item) => sum + item.amount, 0), 0);
  const uncategorized = currentById.get(null) || 0;
  const uncategorizedIncome = currentIncomeChartItems.filter((item) => !(item.category_ids || []).length).reduce((sum, item) => sum + item.amount, 0);
  const categorizedAmount = Math.max(totalExpenses - uncategorized, 0);
  const categorizedIncome = Math.max(totalIncome - uncategorizedIncome, 0);
  const coverage = totalExpenses ? (categorizedAmount / totalExpenses) * 100 : 0;
  const incomeCoverage = totalIncome ? (categorizedIncome / totalIncome) * 100 : 0;
  const budgetedRows = rows.filter((row) => row.limit > 0);
  const availableRows = rows.filter((row) => !row.limit || row.limit <= 0);
  const totalLimits = budgetedRows.reduce((sum, row) => sum + row.limit, 0);
  const overCategoryLimit = budgetedRows.filter((row) => row.spent > row.limit);
  const nearCategoryLimit = budgetedRows.filter((row) => row.spent <= row.limit && row.usage >= 80);
  const topCategory = rows.find((row) => row.spent > 0);
  const topIncomeCategory = currentIncomeChartItems.find((item) => Number(item.amount) > 0);
  const monthChange = changePercentage(totalExpenses, previousExpenses);
  const incomeMonthChange = changePercentage(totalIncome, previousIncome);
  const expenseChartItems = currentChartItems.filter((item) => Number(item.amount) > 0);
  const incomeChartItems = currentIncomeChartItems.filter((item) => Number(item.amount) > 0);
  const viewingIncome = categoryAnalysisView === "income";
  const analysisChartItems = viewingIncome ? incomeChartItems : expenseChartItems;
  const analysisTotal = viewingIncome ? totalIncome : totalExpenses;
  const analysisCoverage = viewingIncome ? incomeCoverage : coverage;
  const analysisTopCategory = viewingIncome ? topIncomeCategory : topCategory;
  const analysisTopAmount = viewingIncome ? Number(topIncomeCategory?.amount || 0) : Number(topCategory?.spent || 0);

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
  const incomeCandidateIds = (budgetPlan?.income_candidates || []).map((item) => item.transaction_id);
  const allIncomeCandidatesSelected = incomeCandidateIds.length > 0 && incomeCandidateIds.every((id) => selectedIncomeIds.includes(id));
  const hasReserveCandidateSelected = selectedCandidates.some((item) => reserveIncomeIds.includes(item.transaction_id));
  const allReserveCandidatesSelected = selectedCandidates.length > 0 && selectedCandidates.every((item) => reserveIncomeIds.includes(item.transaction_id));
  const incomeCandidateGroups = useMemo(() => {
    const grouped = new Map();
    for (const item of budgetPlan?.income_candidates || []) {
      const key = (item.description || "").trim().toLocaleLowerCase(language) || "__without_description__";
      const group = grouped.get(key);
      if (group) group.items.push(item);
      else grouped.set(key, { key, description: item.description, items: [item] });
    }
    return [...grouped.values()];
  }, [budgetPlan?.income_candidates, language]);
  const reserveIncomeCandidateGroups = useMemo(() => {
    const grouped = new Map();
    for (const item of budgetPlan?.income_candidates || []) {
      if (!selectedIncomeIds.includes(item.transaction_id)) continue;
      const key = (item.description || "").trim().toLocaleLowerCase(language) || "__without_description__";
      const group = grouped.get(key);
      if (group) group.items.push(item);
      else grouped.set(key, { key, description: item.description, items: [item] });
    }
    return [...grouped.values()];
  }, [budgetPlan?.income_candidates, selectedIncomeIds, language]);
  const draftTransactionIncome = selectedCandidates.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const draftReserveTransactionIncome = selectedCandidates.filter((item) => reserveIncomeIds.includes(item.transaction_id)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const draftManualIncome = parseTypedMoneyInput(manualIncome, language);
  const draftActualIncome = incomeMode === "manual" ? draftManualIncome : draftTransactionIncome;
  const draftExpectedIncome = parseTypedMoneyInput(expectedIncome, language);
  const draftPlanningIncome = draftActualIncome > 0 ? draftActualIncome : draftExpectedIncome;
  const draftReserveBaseIncome = incomeMode === "transactions" && draftActualIncome > 0 ? draftReserveTransactionIncome : draftPlanningIncome;
  const draftReserveValue = parseTypedMoneyInput(reserveValue, language);
  const draftReserveRequested = reserveType === "percentage" ? draftReserveBaseIncome * Math.min(draftReserveValue, 100) / 100 : draftReserveValue;
  const draftReserveAmount = draftReserveBaseIncome > 0 ? Math.min(draftReserveRequested, draftReserveBaseIncome) : 0;
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
  const toggleIncome = (id) => {
    if (selectedIncomeIds.includes(id)) {
      setSelectedIncomeIds((current) => current.filter((item) => item !== id));
      setReserveIncomeIds((current) => current.filter((item) => item !== id));
    } else {
      setSelectedIncomeIds((current) => [...current, id]);
      setReserveIncomeIds((current) => current.includes(id) ? current : [...current, id]);
    }
  };
  const clearIncomeSelection = () => {
    setSelectedIncomeIds([]);
    setReserveIncomeIds([]);
  };
  const selectAllIncome = () => {
    const newlySelectedIds = incomeCandidateIds.filter((id) => !selectedIncomeIds.includes(id));
    setSelectedIncomeIds([...new Set(incomeCandidateIds)]);
    setReserveIncomeIds((current) => [...new Set([...current, ...newlySelectedIds])]);
  };
  const toggleReserveIncome = (id) => setReserveIncomeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const clearReserveIncomeSelection = () => setReserveIncomeIds([]);
  const selectAllReserveIncome = () => setReserveIncomeIds(selectedCandidates.map((item) => item.transaction_id));
  const toggleIncomeGroup = (items) => {
    const ids = items.map((item) => item.transaction_id);
    const allSelected = ids.every((id) => selectedIncomeIds.includes(id));
    if (allSelected) {
      setSelectedIncomeIds((current) => current.filter((id) => !ids.includes(id)));
      setReserveIncomeIds((current) => current.filter((id) => !ids.includes(id)));
    } else {
      const newlySelectedIds = ids.filter((id) => !selectedIncomeIds.includes(id));
      setSelectedIncomeIds((current) => [...new Set([...current, ...ids])]);
      setReserveIncomeIds((current) => [...new Set([...current, ...newlySelectedIds])]);
    }
  };
  const toggleIncomeGroupExpanded = (key) => setExpandedIncomeGroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const toggleReserveIncomeGroup = (items) => {
    const ids = items.map((item) => item.transaction_id);
    const allIncluded = ids.every((id) => reserveIncomeIds.includes(id));
    setReserveIncomeIds((current) => allIncluded
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
  };
  const toggleReserveIncomeGroupExpanded = (key) => setExpandedReserveIncomeGroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const savePlanning = async () => {
    if (!reserveInputValid || planningSaving) return;
    setPlanningSaving(true);
    try {
      await onSavePlanning({ income_mode: incomeMode, manual_income: manualIncome.trim() ? draftManualIncome : null, expected_income: expectedIncome.trim() ? draftExpectedIncome : null, transaction_ids: selectedIncomeIds, reserve_transaction_ids: reserveIncomeIds.filter((id) => selectedIncomeIds.includes(id)) }, { rule_type: reserveType, value: draftReserveValue });
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
                  <div className="categories-selection-heading">
                    <span>{t("categories.incomeFound")}</span>
                    {incomeCandidateIds.length > 0 && <div className="categories-bulk-actions">
                      <button type="button" disabled={!selectedCandidates.length} onClick={clearIncomeSelection}>{t("categories.clearSelection")}</button>
                      <button type="button" disabled={allIncomeCandidatesSelected} onClick={selectAllIncome}>{t("categories.selectAll")}</button>
                    </div>}
                  </div>
                  {incomeCandidateGroups.length ? incomeCandidateGroups.map((group) => {
                    if (group.items.length === 1) {
                      const item = group.items[0];
                      return (
                        <label key={item.transaction_id} className={`categories-income-candidate ${item.received ? "" : "awaiting"}`}>
                          <input type="checkbox" checked={selectedIncomeIds.includes(item.transaction_id)} onChange={() => toggleIncome(item.transaction_id)} />
                          <span>
                            <strong>{item.description || t("categories.incomeWithoutDescription")}</strong>
                            <small>{formatDateShort(item.date, language)} · {item.received ? t("categories.receivedStatus") : t("categories.awaitingReceipt")}</small>
                          </span>
                          <strong>{formatMoney(item.amount, language)}</strong>
                        </label>
                      );
                    }
                    const selectedCount = group.items.filter((item) => selectedIncomeIds.includes(item.transaction_id)).length;
                    const fullySelected = selectedCount === group.items.length;
                    const partiallySelected = selectedCount > 0 && !fullySelected;
                    const expanded = expandedIncomeGroups.includes(group.key);
                    const total = group.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
                    return (
                      <div key={group.key} className={`categories-income-group ${selectedCount ? "selected" : ""} ${partiallySelected ? "partial" : ""} ${group.items.some((item) => !item.received) ? "awaiting" : ""}`}>
                        <div className="categories-income-group-summary">
                          <input
                            type="checkbox"
                            checked={fullySelected}
                            ref={(checkbox) => { if (checkbox) checkbox.indeterminate = partiallySelected; }}
                            onChange={() => toggleIncomeGroup(group.items)}
                            aria-label={t("categories.selectIncomeGroup", { description: group.description || t("categories.incomeWithoutDescription") })}
                          />
                          <button type="button" className="categories-income-group-copy" onClick={() => toggleIncomeGroup(group.items)}>
                            <strong>{group.description || t("categories.incomeWithoutDescription")}</strong>
                            <small>{t("categories.incomeGroupEntries", { count: group.items.length })}</small>
                          </button>
                          <strong>{formatMoney(total, language)}</strong>
                          <button className="icon-btn small categories-income-group-expand" type="button" onClick={() => toggleIncomeGroupExpanded(group.key)} aria-label={expanded ? t("categories.collapseIncomeGroup") : t("categories.expandIncomeGroup")}>
                            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </div>
                        {expanded && <div className="categories-income-group-items">{group.items.map((item) => (
                          <label key={item.transaction_id} className={`categories-income-candidate ${item.received ? "" : "awaiting"}`}>
                            <input type="checkbox" checked={selectedIncomeIds.includes(item.transaction_id)} onChange={() => toggleIncome(item.transaction_id)} />
                            <span>
                              <strong>{item.description || t("categories.incomeWithoutDescription")}</strong>
                              <small>{formatDateShort(item.date, language)} · {item.received ? t("categories.receivedStatus") : t("categories.awaitingReceipt")}</small>
                            </span>
                            <strong>{formatMoney(item.amount, language)}</strong>
                          </label>
                        ))}</div>}
                      </div>
                    );
                  }) : <div className="categories-income-empty"><Clock3 size={18} /><span><strong>{t("categories.noIncomeTransactions")}</strong><small>{t("categories.noIncomeTransactionsHint")}</small></span></div>}
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
                {draftPlanningIncome > 0 ? draftReserveBaseIncome > 0 ? <p>{draftActualIncome <= 0 ? t("categories.estimatedCalculation") : t("categories.currentIncomeCalculation")} <strong>{formatMoney(draftReserveAmount, language)}</strong>{reserveType === "fixed" && draftActualIncome > 0 ? ` · ${safePercent(draftReserveAmount, draftReserveBaseIncome).toFixed(1)}%` : ""}</p> : <p>{t("categories.reserveWithoutSource")}</p> : <p>{t("categories.reserveWithoutIncome")}</p>}
              </div>
              <div className="categories-reserve-sources">
                <div className="categories-selection-heading">
                  <div><strong>{t("categories.reserveSources")}</strong><small>{t("categories.reserveSourcesHint")}</small></div>
                  {incomeMode === "transactions" && selectedCandidates.length > 0 && <div className="categories-bulk-actions">
                    <button type="button" disabled={!hasReserveCandidateSelected} onClick={clearReserveIncomeSelection}>{t("categories.clearSelection")}</button>
                    <button type="button" disabled={allReserveCandidatesSelected} onClick={selectAllReserveIncome}>{t("categories.selectAll")}</button>
                  </div>}
                </div>
                {incomeMode === "transactions" ? selectedCandidates.length ? (
                  <div className="categories-reserve-source-list">
                    {reserveIncomeCandidateGroups.map((group) => {
                      if (group.items.length === 1) {
                        const item = group.items[0];
                        return (
                          <label key={item.transaction_id}>
                            <input type="checkbox" checked={reserveIncomeIds.includes(item.transaction_id)} onChange={() => toggleReserveIncome(item.transaction_id)} />
                            <span>{item.description || t("categories.incomeWithoutDescription")}</span>
                            <strong>{formatMoney(item.amount, language)}</strong>
                          </label>
                        );
                      }
                      const includedCount = group.items.filter((item) => reserveIncomeIds.includes(item.transaction_id)).length;
                      const fullyIncluded = includedCount === group.items.length;
                      const partiallyIncluded = includedCount > 0 && !fullyIncluded;
                      const expanded = expandedReserveIncomeGroups.includes(group.key);
                      const total = group.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
                      return (
                        <div key={group.key} className={`categories-income-group reserve ${includedCount ? "selected" : ""} ${partiallyIncluded ? "partial" : ""}`}>
                          <div className="categories-income-group-summary">
                            <input
                              type="checkbox"
                              checked={fullyIncluded}
                              ref={(checkbox) => { if (checkbox) checkbox.indeterminate = partiallyIncluded; }}
                              onChange={() => toggleReserveIncomeGroup(group.items)}
                              aria-label={t("categories.selectReserveIncomeGroup", { description: group.description || t("categories.incomeWithoutDescription") })}
                            />
                            <button type="button" className="categories-income-group-copy" onClick={() => toggleReserveIncomeGroup(group.items)}>
                              <strong>{group.description || t("categories.incomeWithoutDescription")}</strong>
                              <small>{t("categories.incomeGroupEntries", { count: group.items.length })}</small>
                            </button>
                            <strong>{formatMoney(total, language)}</strong>
                            <button className="icon-btn small categories-income-group-expand" type="button" onClick={() => toggleReserveIncomeGroupExpanded(group.key)} aria-label={expanded ? t("categories.collapseReserveIncomeGroup") : t("categories.expandReserveIncomeGroup")}>
                              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                          </div>
                          {expanded && <div className="categories-income-group-items">{group.items.map((item) => (
                            <label key={item.transaction_id}>
                              <input type="checkbox" checked={reserveIncomeIds.includes(item.transaction_id)} onChange={() => toggleReserveIncome(item.transaction_id)} />
                              <span>{item.description || t("categories.incomeWithoutDescription")}</span>
                              <strong>{formatMoney(item.amount, language)}</strong>
                            </label>
                          ))}</div>}
                        </div>
                      );
                    })}
                  </div>
                ) : <small className="categories-reserve-source-empty">{t("categories.noReserveSources")}</small> : <small className="categories-reserve-source-empty">{t("categories.manualReserveSource")}</small>}
                <div className="categories-reserve-source-total"><span>{t("categories.reserveBase")}</span><strong>{formatMoney(draftReserveBaseIncome, language)}</strong></div>
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
        <article className="card categories-chart-card">
          <div className="categories-card-heading">
            <div><p className="eyebrow">{t("categories.distributionEyebrow")}</p><h2>{viewingIncome ? t("categories.incomeDistribution") : t("categories.distribution")}</h2></div>
            <div className="categories-analysis-heading-actions">
              <div className="category-view-toggle">
                <button className={!viewingIncome ? "active" : ""} type="button" onClick={() => setCategoryAnalysisView("expenses")}>{t("categories.analysisExpenses")}</button>
                <button className={viewingIncome ? "active" : ""} type="button" onClick={() => setCategoryAnalysisView("income")}>{t("categories.analysisIncome")}</button>
              </div>
              <div className="categories-analysis-meta"><span>{viewingIncome ? t("categories.classifiedIncome") : t("categories.classified")}</span><strong>{analysisCoverage.toFixed(0)}%</strong></div>
            </div>
          </div>
          {analysisChartItems.length ? <>
            <div className="categories-donut">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie className="categories-clickable-pie" data={analysisChartItems} dataKey="amount" nameKey="name" innerRadius={72} outerRadius={105} paddingAngle={2} stroke="none" onClick={(entry) => openCategoryDetails(entry?.payload || entry)}>
                    {analysisChartItems.map((item) => <Cell key={item.category_ids?.join("-") || "uncategorized"} fill={item.color} />)}
                  </Pie>
                  <Tooltip content={<CategoryChartTooltip language={language} />} />
                </PieChart>
              </ResponsiveContainer>
              <div><span>{t("categories.total")}</span><strong>{formatMoney(analysisTotal, language)}</strong></div>
            </div>
            <div className="categories-legend">
              {analysisChartItems.map((item) => (
                <button type="button" key={item.category_ids?.join("-") || "uncategorized"} onClick={() => openCategoryDetails(item)}>
                  <i style={{ "--category-color": item.color }} />
                  <span><strong>{item.name}</strong><small>{Number(item.percentage).toFixed(1)}%</small></span>
                  <strong>{formatMoney(item.amount, language)}</strong>
                </button>
              ))}
            </div>
            {analysisTopCategory && <div className="categories-top-category"><TrendingUp size={15} /><span>{viewingIncome ? t("categories.biggestIncome") : t("categories.biggestExpense")}: <strong>{analysisTopCategory.name}</strong></span><strong>{formatMoney(analysisTopAmount, language)}</strong></div>}
          </> : <div className="categories-empty"><PieChartIcon size={30} /><p>{viewingIncome ? t("categories.emptyIncome") : t("categories.empty")}</p></div>}
        </article>
        <article className="card categories-insights-card">
          <div className="categories-card-heading"><div><p className="eyebrow">{t("categories.insightsEyebrow")}</p><h2>{viewingIncome ? t("categories.incomeInsights") : t("categories.insights")}</h2></div></div>
          <div className="categories-insights-list">
            {viewingIncome ? <>
              {uncategorizedIncome > 0 && <div className="categories-insight neutral"><Tags size={19} /><span><strong>{t("categories.uncategorizedIncomeValue", { value: formatMoney(uncategorizedIncome, language) })}</strong><small>{t("categories.uncategorizedIncomeHint")}</small></span></div>}
              {incomeMonthChange !== 0 && <div className={`categories-insight ${incomeMonthChange > 0 ? "success" : "warning"}`}>{incomeMonthChange > 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />}<span><strong>{incomeMonthChange > 0 ? t("categories.incomeIncreased", { value: Math.abs(incomeMonthChange).toFixed(1) }) : t("categories.incomeDecreased", { value: Math.abs(incomeMonthChange).toFixed(1) })}</strong><small>{t("categories.previousIncomeTotal", { value: formatMoney(previousIncome, language) })}</small></span></div>}
              {totalIncome <= 0 && <div className="categories-insight neutral"><Banknote size={19} /><span><strong>{t("categories.noIncomeInsights")}</strong><small>{t("categories.noIncomeInsightsHint")}</small></span></div>}
              {totalIncome > 0 && !uncategorizedIncome && incomeMonthChange === 0 && <div className="categories-insight success"><CheckCircle2 size={19} /><span><strong>{t("categories.incomeAllGood")}</strong><small>{t("categories.incomeAllGoodHint")}</small></span></div>}
            </> : <>
              {overCategoryLimit.length > 0 && <div className="categories-insight danger"><AlertTriangle size={19} /><span><strong>{t("categories.overLimitCount", { count: overCategoryLimit.length })}</strong><small>{overCategoryLimit.map((row) => row.name).join(", ")}</small></span></div>}
              {nearCategoryLimit.length > 0 && <div className="categories-insight warning"><Target size={19} /><span><strong>{t("categories.nearLimitCount", { count: nearCategoryLimit.length })}</strong><small>{nearCategoryLimit.map((row) => row.name).join(", ")}</small></span></div>}
              {uncategorized > 0 && <div className="categories-insight neutral"><Tags size={19} /><span><strong>{t("categories.uncategorizedValue", { value: formatMoney(uncategorized, language) })}</strong><small>{t("categories.uncategorizedHint")}</small></span></div>}
              {monthChange !== 0 && <div className={`categories-insight ${monthChange > 0 ? "warning" : "success"}`}>{monthChange > 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />}<span><strong>{monthChange > 0 ? t("categories.spendingIncreased", { value: Math.abs(monthChange).toFixed(1) }) : t("categories.spendingDecreased", { value: Math.abs(monthChange).toFixed(1) })}</strong><small>{t("categories.previousTotal", { value: formatMoney(previousExpenses, language) })}</small></span></div>}
              {!hasPlannedIncome && totalExpenses > 0 && <div className="categories-insight neutral"><WalletCards size={19} /><span><strong>{t("categories.budgetNotDefined")}</strong><small>{t("categories.expensesBeforeBudget", { value: formatMoney(totalExpenses, language) })}</small></span></div>}
              {!overCategoryLimit.length && !nearCategoryLimit.length && !uncategorized && monthChange === 0 && <div className="categories-insight success"><CheckCircle2 size={19} /><span><strong>{t("categories.allGood")}</strong><small>{t("categories.allGoodHint")}</small></span></div>}
            </>}
          </div>
        </article>
      </section>
      {selectedExpenseGroup && <CategoryExpenseDetails group={selectedExpenseGroup} categories={categories} language={language} loading={expenseDetailsLoading} error={expenseDetailsError} income={viewingIncome} onClose={() => setSelectedExpenseGroup(null)} />}
    </div>
  );
}
