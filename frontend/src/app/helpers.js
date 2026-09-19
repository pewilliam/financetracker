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

export function nextMonthDate(dateString) {
  return addMonthsToDate(dateString, 1);
}

export function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function normalizeInvoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : DEFAULT_INVOICE_COLOR;
}

export function defaultInvoiceForm() {
  return { template_id: "", due_date: "", wallet_id: "", duplicate_next_month: false, duplicate_months: 1 };
}

export function defaultTemplateForm() {
  return { name: "", color: DEFAULT_INVOICE_COLOR, default_due_day: 30 };
}

export function defaultInstallmentForm(firstInvoiceId = "") {
  return {
    description: "",
    total_amount: "",
    installment_count: 1,
    first_invoice_id: firstInvoiceId,
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
    allocation_mode: "total"
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

export function formatMonthSlash(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const month = date.toLocaleDateString(getFormatLocale(), { month: "short" }).replace(".", "");
  const normalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${normalizedMonth}/${date.getFullYear()}`;
}
