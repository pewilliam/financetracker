import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PieChart as PieChartIcon, Plus, Save, Tags, Target, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, parseTypedMoneyInput } from "../utils/format.js";


function changePercentage(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function limitDraft(value, language) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CategoriesPage({
  categories = [],
  categoryBreakdown = { total_expenses: 0, items: [] },
  previousCategoryBreakdown = { total_expenses: 0, items: [] },
  onUpdateCategory,
}) {
  const { t, language } = useI18n();
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [addingLimit, setAddingLimit] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newLimit, setNewLimit] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map((category) => [category.id, limitDraft(category.monthly_limit, language)])));
  }, [categories, language]);

  const currentById = useMemo(() => new Map(
    (categoryBreakdown.items || []).map((item) => [item.category_id, Number(item.amount || 0)])
  ), [categoryBreakdown.items]);
  const previousById = useMemo(() => new Map(
    (previousCategoryBreakdown.items || []).map((item) => [item.category_id, Number(item.amount || 0)])
  ), [previousCategoryBreakdown.items]);

  const rows = useMemo(() => categories.map((category) => {
    const spent = currentById.get(category.id) || 0;
    const previous = previousById.get(category.id) || 0;
    const limit = category.monthly_limit === null || category.monthly_limit === undefined ? null : Number(category.monthly_limit);
    const usage = limit && limit > 0 ? (spent / limit) * 100 : null;
    return { ...category, spent, previous, limit, usage };
  }).sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name, language)), [categories, currentById, previousById, language]);

  const totalExpenses = Number(categoryBreakdown.total_expenses || 0);
  const previousExpenses = Number(previousCategoryBreakdown.total_expenses || 0);
  const uncategorized = currentById.get(null) || 0;
  const categorizedAmount = Math.max(totalExpenses - uncategorized, 0);
  const coverage = totalExpenses ? (categorizedAmount / totalExpenses) * 100 : 0;
  const budgetedRows = rows.filter((row) => row.limit !== null && row.limit > 0);
  const availableRows = rows.filter((row) => row.limit === null || row.limit <= 0);
  const totalBudget = budgetedRows.reduce((sum, row) => sum + row.limit, 0);
  const budgetedSpent = budgetedRows.reduce((sum, row) => sum + row.spent, 0);
  const remainingBudget = totalBudget - budgetedSpent;
  const overBudget = budgetedRows.filter((row) => row.spent > row.limit);
  const nearLimit = budgetedRows.filter((row) => row.spent <= row.limit && row.usage >= 80);
  const topCategory = rows.find((row) => row.spent > 0);
  const monthChange = changePercentage(totalExpenses, previousExpenses);
  const chartItems = (categoryBreakdown.items || []).filter((item) => Number(item.amount) > 0);

  const saveLimit = async (category) => {
    const draft = String(drafts[category.id] ?? "").trim();
    const parsedLimit = draft ? parseTypedMoneyInput(draft, language) : 0;
    const monthlyLimit = parsedLimit > 0 ? parsedLimit : null;
    if (monthlyLimit !== null && (!Number.isFinite(monthlyLimit) || monthlyLimit < 0)) return;
    setSavingId(category.id);
    try {
      await onUpdateCategory(category.id, { monthly_limit: monthlyLimit });
    } finally {
      setSavingId(null);
    }
  };

  const openLimitForm = () => {
    if (!availableRows.length) return;
    setSelectedCategoryId(String(availableRows[0].id));
    setNewLimit("");
    setAddingLimit(true);
  };

  const closeLimitForm = () => {
    setAddingLimit(false);
    setSelectedCategoryId("");
    setNewLimit("");
  };

  const addLimit = async () => {
    const category = availableRows.find((row) => row.id === Number(selectedCategoryId));
    const monthlyLimit = parseTypedMoneyInput(newLimit, language);
    if (!category || monthlyLimit <= 0) return;
    setSavingId("new");
    try {
      await onUpdateCategory(category.id, { monthly_limit: monthlyLimit });
      closeLimitForm();
    } finally {
      setSavingId(null);
    }
  };

  const removeLimit = async (category) => {
    setSavingId(category.id);
    try {
      await onUpdateCategory(category.id, { monthly_limit: null });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="categories-page">
      <section className="card categories-hero">
        <div className="categories-hero-icon"><Tags size={25} /></div>
        <div>
          <p className="eyebrow">{t("categories.eyebrow")}</p>
          <h1>{t("categories.title")}</h1>
          <p>{t("categories.description")}</p>
        </div>
        <div className="categories-hero-total">
          <span>{t("categories.totalThisMonth")}</span>
          <strong>{formatMoney(totalExpenses, language)}</strong>
          <small className={monthChange > 0 ? "negative" : "positive"}>
            {monthChange > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {t("categories.vsPrevious", { value: Math.abs(monthChange).toFixed(1) })}
          </small>
        </div>
      </section>

      <section className="categories-summary-grid">
        <article className="card categories-stat">
          <i><PieChartIcon size={19} /></i>
          <span>{t("categories.classified")}</span>
          <strong>{coverage.toFixed(0)}%</strong>
          <small>{formatMoney(categorizedAmount, language)} {t("categories.ofExpenses")}</small>
        </article>
        <article className="card categories-stat">
          <i><Target size={19} /></i>
          <span>{t("categories.planned")}</span>
          <strong>{formatMoney(totalBudget, language)}</strong>
          <small>{t("categories.inCategories", { count: budgetedRows.length })}</small>
        </article>
        <article className={`card categories-stat ${remainingBudget < 0 ? "danger" : ""}`}>
          <i>{remainingBudget < 0 ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}</i>
          <span>{remainingBudget < 0 ? t("categories.overBudget") : t("categories.available")}</span>
          <strong>{formatMoney(Math.abs(remainingBudget), language)}</strong>
          <small>{formatMoney(budgetedSpent, language)} {t("categories.usedFromLimits")}</small>
        </article>
        <article className="card categories-stat">
          <i><TrendingUp size={19} /></i>
          <span>{t("categories.biggestExpense")}</span>
          <strong className="categories-stat-name">{topCategory?.name || "—"}</strong>
          <small>{topCategory ? formatMoney(topCategory.spent, language) : t("categories.noExpenses")}</small>
        </article>
      </section>

      <section className="categories-main-grid">
        <article className="card categories-chart-card">
          <div className="categories-card-heading">
            <div>
              <p className="eyebrow">{t("categories.distributionEyebrow")}</p>
              <h2>{t("categories.distribution")}</h2>
            </div>
          </div>
          {chartItems.length ? (
            <>
              <div className="categories-donut">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={chartItems} dataKey="amount" nameKey="name" innerRadius={72} outerRadius={105} paddingAngle={2} stroke="none">
                      {chartItems.map((item) => <Cell key={item.category_id ?? "uncategorized"} fill={item.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(value, language)} />
                  </PieChart>
                </ResponsiveContainer>
                <div><span>{t("categories.total")}</span><strong>{formatMoney(totalExpenses, language)}</strong></div>
              </div>
              <div className="categories-legend">
                {chartItems.map((item) => (
                  <div key={item.category_id ?? "uncategorized"}>
                    <i style={{ "--category-color": item.color }} />
                    <span><strong>{item.name}</strong><small>{Number(item.percentage).toFixed(1)}%</small></span>
                    <strong>{formatMoney(item.amount, language)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="categories-empty"><PieChartIcon size={30} /><p>{t("categories.empty")}</p></div>}
        </article>

        <article className="card categories-insights-card">
          <div className="categories-card-heading">
            <div>
              <p className="eyebrow">{t("categories.insightsEyebrow")}</p>
              <h2>{t("categories.insights")}</h2>
            </div>
          </div>
          <div className="categories-insights-list">
            {overBudget.length > 0 && (
              <div className="categories-insight danger">
                <AlertTriangle size={19} />
                <span><strong>{t("categories.overLimitCount", { count: overBudget.length })}</strong><small>{overBudget.map((row) => row.name).join(", ")}</small></span>
              </div>
            )}
            {nearLimit.length > 0 && (
              <div className="categories-insight warning">
                <Target size={19} />
                <span><strong>{t("categories.nearLimitCount", { count: nearLimit.length })}</strong><small>{nearLimit.map((row) => row.name).join(", ")}</small></span>
              </div>
            )}
            {uncategorized > 0 && (
              <div className="categories-insight neutral">
                <Tags size={19} />
                <span><strong>{t("categories.uncategorizedValue", { value: formatMoney(uncategorized, language) })}</strong><small>{t("categories.uncategorizedHint")}</small></span>
              </div>
            )}
            {monthChange !== 0 && (
              <div className={`categories-insight ${monthChange > 0 ? "danger" : "success"}`}>
                {monthChange > 0 ? <TrendingUp size={19} /> : <TrendingDown size={19} />}
                <span>
                  <strong>{monthChange > 0 ? t("categories.spendingIncreased", { value: Math.abs(monthChange).toFixed(1) }) : t("categories.spendingDecreased", { value: Math.abs(monthChange).toFixed(1) })}</strong>
                  <small>{t("categories.previousTotal", { value: formatMoney(previousExpenses, language) })}</small>
                </span>
              </div>
            )}
            {!overBudget.length && !nearLimit.length && !uncategorized && monthChange === 0 && (
              <div className="categories-insight success"><CheckCircle2 size={19} /><span><strong>{t("categories.allGood")}</strong><small>{t("categories.allGoodHint")}</small></span></div>
            )}
          </div>
        </article>
      </section>

      <section className="card categories-budget-card">
        <div className="categories-card-heading categories-budget-heading">
          <div>
            <p className="eyebrow">{t("categories.limitsEyebrow")}</p>
            <h2>{t("categories.limits")}</h2>
            <span>{t("categories.limitsDescription")}</span>
          </div>
          <div className="categories-budget-heading-actions">
            <small>{t("categories.configuredCount", { configured: budgetedRows.length, total: categories.length })}</small>
            {categories.length > 0 && (
              <button className="btn compact" type="button" onClick={openLimitForm} disabled={addingLimit || !availableRows.length}>
                <Plus size={15} /> {t("categories.addLimit")}
              </button>
            )}
          </div>
        </div>
        {addingLimit && (
          <div className="categories-limit-add">
            <div className="categories-limit-add-title">
              <i><Plus size={17} /></i>
              <span><strong>{t("categories.newLimit")}</strong><small>{t("categories.newLimitHint")}</small></span>
            </div>
            <label className="categories-limit-add-field">
              <span>{t("categories.chooseCategory")}</span>
              <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                {availableRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <div className="categories-limit-add-field">
              <span>{t("categories.monthlyLimit")}</span>
              <label className="categories-money-field">
                <span>R$</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  aria-label={t("categories.monthlyLimit")}
                  placeholder="0,00"
                  value={newLimit}
                  onChange={(event) => setNewLimit(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLimit(); } }}
                />
              </label>
            </div>
            <div className="categories-limit-add-actions">
              <button className="icon-btn" type="button" onClick={closeLimitForm} aria-label={t("actions.cancel")}><X size={17} /></button>
              <button className="btn btn-primary" type="button" disabled={!selectedCategoryId || parseTypedMoneyInput(newLimit, language) <= 0 || savingId === "new"} onClick={addLimit}>
                {savingId === "new" ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} {t("categories.confirmAdd")}
              </button>
            </div>
          </div>
        )}
        {budgetedRows.length ? (
          <div className="categories-budget-list">
            {budgetedRows.map((row) => {
              const progress = row.usage === null ? 0 : Math.min(row.usage, 100);
              const status = row.usage > 100 ? "danger" : row.usage >= 80 ? "warning" : "success";
              const changed = String(drafts[row.id] ?? "").trim() !== limitDraft(row.monthly_limit, language);
              return (
                <div className="categories-budget-row" key={row.id}>
                  <div className="categories-budget-name">
                    <i style={{ "--category-color": row.color }} />
                    <span><strong>{row.name}</strong><small>{formatMoney(row.spent, language)} {t("categories.spent")}</small></span>
                  </div>
                  <div className={`categories-budget-progress ${status}`}>
                    <div><span style={{ width: `${progress}%` }} /></div>
                    <small>{Math.round(row.usage)}%</small>
                  </div>
                  <div className="categories-limit-form">
                    <label className="categories-money-field">
                      <span>R$</span>
                      <input
                        inputMode="decimal"
                        aria-label={t("categories.limitFor", { name: row.name })}
                        placeholder="0,00"
                        value={drafts[row.id] ?? ""}
                        onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveLimit(row); } }}
                      />
                    </label>
                    <div className="categories-limit-actions">
                      <button className="icon-btn small" type="button" disabled={!changed || savingId === row.id} onClick={() => saveLimit(row)} aria-label={t("categories.saveLimit")}>
                        {savingId === row.id ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
                      </button>
                      <button className="icon-btn small danger" type="button" disabled={savingId === row.id} onClick={() => removeLimit(row)} aria-label={t("categories.removeLimit")}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !addingLimit && (
          <div className="categories-empty categories-limits-empty">
            <Target size={30} />
            <strong>{categories.length ? t("categories.noLimitsTitle") : t("categories.noCategories")}</strong>
            {categories.length > 0 && <><p>{t("categories.noLimitsHint")}</p><button className="btn btn-primary compact" type="button" onClick={openLimitForm}><Plus size={15} /> {t("categories.addFirstLimit")}</button></>}
          </div>
        )}
      </section>
    </div>
  );
}
