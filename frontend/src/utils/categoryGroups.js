export function expenseGroupKey(item) {
  if (item?.dashboardKey) return item.dashboardKey;
  return item?.category_ids?.length
    ? [...item.category_ids].sort((left, right) => left - right).join("-")
    : "uncategorized";
}

export function buildVisibleExpenseGroups(items, categories, ignoredCategoryIds) {
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
    const groupCategories = visibleIds
      .map((categoryId) => categoriesById.get(categoryId))
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));
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
        details: [...(item.details || [])]
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
      })
    }))
    .sort((left, right) => right.amount - left.amount);
}
