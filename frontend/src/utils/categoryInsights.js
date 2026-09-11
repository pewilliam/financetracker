function categoryIdsFor(entry) {
  if (entry?.category_ids?.length) return entry.category_ids.map(String);
  if (entry?.categories?.length) return entry.categories.map((category) => String(category.id));
  if (entry?.category_id !== null && entry?.category_id !== undefined) return [String(entry.category_id)];
  if (entry?.category?.id !== null && entry?.category?.id !== undefined) return [String(entry.category.id)];
  return [];
}

function registrationTimeFor(entry) {
  const createdAt = Date.parse(entry?.created_at || "");
  if (!Number.isNaN(createdAt)) return createdAt;

  const fallbackDate = Date.parse(`${String(entry?.date || "").slice(0, 10)}T00:00:00`);
  return Number.isNaN(fallbackDate) ? 0 : fallbackDate;
}

export function buildUnifiedExpenseInsight(entries, target, category, language) {
  if (!target?.date || !target?.sourceType || target?.sourceId === null || target?.sourceId === undefined || !category) return null;

  const month = String(target.date).slice(0, 7);
  const categoryId = String(category.id);
  const categoryEntries = [];
  let categoryTotal = 0;

  for (const entry of entries || []) {
    if (entry.source_type === "installment_purchase" || String(entry.date || "").slice(0, 7) !== month) continue;
    if (!categoryIdsFor(entry).includes(categoryId)) continue;
    categoryEntries.push(entry);
    categoryTotal += Math.abs(Number(entry.amount || 0));
  }

  categoryEntries.sort((left, right) => (
    registrationTimeFor(left) - registrationTimeFor(right)
    || String(left.source_type || "").localeCompare(String(right.source_type || ""))
    || Number(left.source_id || 0) - Number(right.source_id || 0)
  ));

  const position = categoryEntries.findIndex((entry) => (
    entry.source_type === target.sourceType && String(entry.source_id) === String(target.sourceId)
  )) + 1;
  if (!position || !categoryTotal) return null;

  const share = Math.min((Math.abs(Number(target.amount || 0)) / categoryTotal) * 100, 100);
  const count = categoryEntries.length;
  const expenseLabel = language === "en-US"
    ? (count === 1 ? "expense" : "expenses")
    : (count === 1 ? "gasto" : "gastos");

  return {
    label: language === "en-US"
      ? `#${position} of ${count} ${expenseLabel} in ${category.name} this month`
      : `${position}º de ${count} ${expenseLabel} em ${category.name} neste mês`,
    share,
    shareLabel: language === "en-US"
      ? `${share.toLocaleString(language, { maximumFractionDigits: 1 })}% of the category total`
      : `${share.toLocaleString(language, { maximumFractionDigits: 1 })}% do total da categoria`,
  };
}
