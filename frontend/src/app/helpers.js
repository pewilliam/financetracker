import { DEFAULT_INVOICE_COLOR, MOBILE_MEDIA_QUERY } from "./constants.js";
import { getFormatLocale } from "../utils/format.js";

export function shiftMonth(year, month, delta) {
  const total = year * 12 + month - 1 + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function addMonthsToDate(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const shifted = shiftMonth(year, month, amount);
  const lastDay = lastDayOfMonth(shifted.year, shifted.month);
  return `${shifted.year}-${String(shifted.month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function isoDate(year, month, day) {
  const lastDay = lastDayOfMonth(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function invoicePeriod(closingDay, dueDay, purchaseDate) {
  const [year, month, day] = String(purchaseDate).split("-").map(Number);
  const closingThisMonth = Math.min(Number(closingDay), lastDayOfMonth(year, month));
  const close = day <= closingThisMonth ? { year, month } : shiftMonth(year, month, 1);
  const due = Number(dueDay) <= Number(closingDay) ? shiftMonth(close.year, close.month, 1) : close;
  return {
    closingDate: isoDate(close.year, close.month, Number(closingDay)),
    dueDate: isoDate(due.year, due.month, Number(dueDay)),
  };
}

export function nextMonthDate(dateString) {
  return addMonthsToDate(dateString, 1);
}

export function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function normalizeInvoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : DEFAULT_INVOICE_COLOR;
}

export function defaultCardForm() {
  return { name: "", institution: "", color: DEFAULT_INVOICE_COLOR, credit_limit: "", closing_day: 23, due_day: 30, default_wallet_id: "" };
}

export function defaultInstallmentForm(cardId = "") {
  return {
    description: "",
    total_amount: "",
    installment_count: 1,
    credit_card_id: cardId ? String(cardId) : "",
    first_purchase_date: todayIsoDate(),
    category_ids: [],
    different_values: false
  };
}

export function defaultReceivableForm() {
  return {
    person_id: "",
    person_name: "",
    description: "",
    total_amount: "",
    due_date: todayIsoDate(),
    category_ids: [],
    notes: "",
    expense_source_key: "",
    installment_scope: "all",
    allocation_mode: "total",
    series_count: 1,
    installment_amounts: []
  };
}

export function todayIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function invoiceAcceptsNewCharges(invoice, allowOverdue = false) {
  if (!invoice || invoice.paid) return false;
  return allowOverdue || String(invoice.due_date || "").slice(0, 10) >= todayIsoDate();
}

export function isInvoiceTransaction(entry) {
  return Boolean(entry?.invoice_id);
}

export function entryCategories(entry) {
  return entry?.categories?.length ? entry.categories : entry?.category ? [entry.category] : [];
}

// Uma combinação de categorias vira um grupo próprio, como nos gráficos do dashboard:
// "Alimentação + Saídas" não soma em "Alimentação".
export function categoryCombination(categories = []) {
  const unique = [...new Map(categories.map((category) => [Number(category.id), category])).values()];
  if (!unique.length) return { id: "uncategorized", name: null, color: null };
  const byName = [...unique].sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  return {
    id: unique.map((category) => Number(category.id)).sort((left, right) => left - right).join("-"),
    name: byName.map((category) => category.name).join(" + "),
    color: byName[0]?.color || null,
  };
}

export function invoiceCategoryTotals(invoice) {
  const entries = [...(invoice?.items || []), ...(invoice?.installment_items || [])];
  const totals = new Map();
  entries.forEach((entry) => {
    const group = categoryCombination(entryCategories(entry));
    const current = totals.get(group.id) || { ...group, amount: 0 };
    current.amount += Number(entry.amount || 0);
    totals.set(group.id, current);
  });
  return [...totals.values()].filter((entry) => entry.amount > 0).sort((left, right) => right.amount - left.amount);
}

export function normalizeTransactionPayload(data) {
  const parsedAmount = Number(data?.amount);
  const normalized = {
    date: String(data?.date || "").slice(0, 10),
    type: String(data?.type || ""),
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    description: data?.description ? String(data.description).trim() : "",
    is_future: Boolean(data?.is_future)
  };
  normalized.category_ids = (data?.category_ids || (data?.category_id ? [data.category_id] : [])).map(Number);
    normalized.expense_link = data?.expense_link || null;
    normalized.wallet_id = data?.wallet_id ? Number(data.wallet_id) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) normalized.date = "";
  return normalized;
}

export function nextDueDateFromDay(day) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 2;
  const target = new Date(year, month - 1, 1);
  const lastDay = lastDayOfMonth(target.getFullYear(), target.getMonth() + 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(Math.min(Number(day) || 1, lastDay)).padStart(2, "0")}`;
}

export function yearMonthKey(dateString) {
  return String(dateString || "").slice(0, 7);
}

export function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function quickAddDate(year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const day = year === currentYear && month === currentMonth ? now.getDate() : lastDayOfMonth(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getMonthPeriod(item) {
  const today = new Date();
  const currentIndex = today.getFullYear() * 12 + today.getMonth();
  const itemIndex = Number(item.year) * 12 + Number(item.month) - 1;
  if (itemIndex === currentIndex) return "current";
  return itemIndex > currentIndex ? "future" : "past";
}

export function formatTransactionCount(count, future) {
  const total = Number(count || 0);
  const suffix = total === 1 ? "lançamento" : "lançamentos";
  return `${total} ${suffix}${future ? " previstos" : ""}`;
}

export function receivableStatusText(status, language = "pt-BR") {
  const labels = language === "en-US"
    ? { pending: "Pending", paid: "Paid", overdue: "Overdue", partial: "Partial" }
    : { pending: "Pendente", paid: "Pago", overdue: "Atrasada", partial: "Parcial" };
  return labels[status] || labels.pending;
}

export function formatMonthShort(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const label = date.toLocaleDateString(getFormatLocale(), { month: "short", year: "numeric" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function transactionDate(transaction) {
  return String(transaction?.date || "").slice(0, 10);
}

function transactionDelta(transaction) {
  const amount = Number(transaction?.amount) || 0;
  return transaction?.type === "income" ? amount : -amount;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
}

export function mergeCreatedTransaction(monthData, transaction) {
  const date = transactionDate(transaction);
  const [year, month] = date.split("-").map(Number);
  if (!monthData?.days || !year || !month) return null;
  if (Number(monthData.year) !== year || Number(monthData.month) !== month) return null;

  const delta = transactionDelta(transaction);
  const amount = Math.abs(delta);
  let inserted = false;
  const days = monthData.days.map((day) => {
    const dayDate = String(day.date).slice(0, 10);
    if (dayDate < date) return day;
    if (dayDate === date) {
      if ((day.transactions || []).some((item) => item.id === transaction.id)) return day;
      inserted = true;
      const notes = [day.notes, transaction.description].filter(Boolean).join("; ");
      return {
        ...day,
        transactions: [...(day.transactions || []), transaction].sort((left, right) => Number(left.id) - Number(right.id)),
        income: roundMoney(Number(day.income || 0) + (transaction.type === "income" ? amount : 0)),
        expenses: roundMoney(Number(day.expenses || 0) + (transaction.type === "expense" ? amount : 0)),
        balance: roundMoney(Number(day.balance || 0) + delta),
        projected_balance: roundMoney(Number(day.projected_balance ?? day.balance ?? 0) + delta),
        notes: notes || null,
        has_future: Boolean(day.has_future || transaction.is_future),
      };
    }
    return {
      ...day,
      balance: roundMoney(Number(day.balance || 0) + delta),
      projected_balance: roundMoney(Number(day.projected_balance ?? day.balance ?? 0) + delta),
    };
  });
  if (!inserted) return null;
  return {
    ...monthData,
    days,
    total_income: roundMoney(Number(monthData.total_income || 0) + (transaction.type === "income" ? amount : 0)),
    total_expenses: roundMoney(Number(monthData.total_expenses || 0) + (transaction.type === "expense" ? amount : 0)),
    closing_balance: roundMoney(Number(monthData.closing_balance || 0) + delta),
  };
}

export function patchSummaryForTransaction(summary, transaction) {
  if (!summary) return summary;
  const date = transactionDate(transaction);
  const [year, month] = date.split("-").map(Number);
  if (Number(summary.year) !== year || Number(summary.month) !== month) return summary;
  const delta = transactionDelta(transaction);
  const amount = Math.abs(delta);
  const today = todayIso();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
  const totalIncome = roundMoney(Number(summary.total_income || 0) + (transaction.type === "income" ? amount : 0));
  const totalExpenses = roundMoney(Number(summary.total_expenses || 0) + (transaction.type === "expense" ? amount : 0));
  let currentBalance = Number(summary.current_balance || 0);
  let futureNet = Number(summary.future_net || 0);
  if (end < today) currentBalance += delta;
  else if (start > today) futureNet += delta;
  else if (date <= today) currentBalance += delta;
  else futureNet += delta;
  const transactionsClosing = roundMoney(currentBalance + futureNet);
  const planned = Number(summary.planned_receivables_total || 0);
  return {
    ...summary,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    difference: roundMoney(totalExpenses - totalIncome),
    current_balance: roundMoney(currentBalance),
    future_net: roundMoney(futureNet),
    transactions_projected_closing: transactionsClosing,
    projected_closing: roundMoney(transactionsClosing + planned),
  };
}

export function patchMonthCardsForTransaction(cards, transaction) {
  if (!Array.isArray(cards) || !cards.length) return cards;
  const date = transactionDate(transaction);
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return cards;
  const delta = transactionDelta(transaction);
  const amount = Math.abs(delta);
  const today = todayIso();
  const txKey = monthKey(year, month);
  const todayKey = today.slice(0, 7);
  return cards.map((card) => {
    const key = monthKey(card.year, card.month);
    if (key < txKey) return card;
    if (key === txKey) {
      const opening = Number(card.opening_balance || 0);
      const closing = roundMoney(Number(card.closing_balance || 0) + delta);
      let current = Number(card.current_balance || 0);
      if (key < todayKey || (key === todayKey && date <= today)) current += delta;
      return {
        ...card,
        total_income: roundMoney(Number(card.total_income || 0) + (transaction.type === "income" ? amount : 0)),
        total_expenses: roundMoney(Number(card.total_expenses || 0) + (transaction.type === "expense" ? amount : 0)),
        closing_balance: closing,
        current_balance: roundMoney(current),
        transaction_count: Number(card.transaction_count || 0) + 1,
        difference_pct: opening ? roundMoney(((closing - opening) / Math.abs(opening)) * 100) : 0,
      };
    }
    const opening = roundMoney(Number(card.opening_balance || 0) + delta);
    const closing = roundMoney(Number(card.closing_balance || 0) + delta);
    return {
      ...card,
      opening_balance: opening,
      closing_balance: closing,
      current_balance: roundMoney(Number(card.current_balance || 0) + delta),
      difference_pct: opening ? roundMoney(((closing - opening) / Math.abs(opening)) * 100) : card.difference_pct,
    };
  });
}

export function formatMonthSlash(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const month = date.toLocaleDateString(getFormatLocale(), { month: "short" }).replace(".", "");
  const normalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${normalizedMonth}/${date.getFullYear()}`;
}
