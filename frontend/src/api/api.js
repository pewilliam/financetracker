const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "finance-token";

export class ApiError extends Error {
  constructor(message, status, retryAfter = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") message = payload.detail;
      else if (Array.isArray(payload.detail) && payload.detail[0]?.msg) {
        message = payload.detail[0].msg.replace(/^Value error,\s*/i, "");
      }
    } catch {
      // Keep a stable fallback for non-JSON failures (proxy, gateway, etc.).
    }
    throw new ApiError(message, response.status, response.headers.get("Retry-After"));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function register(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMe() {
  return request("/auth/me");
}

export function updateMe(payload) {
  return request("/auth/me", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function updatePassword(payload) {
  return request("/auth/password", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function getMonth(year, month, { includeLinks = true, signal } = {}) {
  const query = includeLinks ? "" : "?include_links=false";
  return request(`/months/${year}/${month}${query}`, { signal });
}

export function getMonthSummary(year, month, { signal } = {}) {
  return request(`/months/${year}/${month}/summary`, { signal });
}

export function getMonthSummarySeries(year, month, count = 6, { signal } = {}) {
  const params = new URLSearchParams({ year: String(year), month: String(month), count: String(count) });
  return request(`/months/summary-series?${params}`, { signal });
}

export function getMonthsSummary({ signal } = {}) {
  return request("/months/summary", { signal });
}

export function setOpeningBalance(year, month, opening_balance) {
  return request(`/months/${year}/${month}/opening-balance`, {
    method: "PUT",
    body: JSON.stringify({ opening_balance })
  });
}

export function createTransaction(payload) {
  return request("/transactions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listWallets(includeArchived = true, { signal } = {}) {
  return request(`/wallets?include_archived=${includeArchived ? "true" : "false"}`, { signal });
}

export function getWallet(id) {
  return request(`/wallets/${id}`);
}

export function getWalletMovements(id, { year, month, page = 1, pageSize = 10 }) {
  const params = new URLSearchParams({ year, month, page, page_size: pageSize });
  return request(`/wallets/${id}/movements?${params}`);
}

export function createWallet(payload) {
  return request("/wallets", { method: "POST", body: JSON.stringify(payload) });
}

export function updateWallet(id, payload) {
  return request(`/wallets/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function archiveWallet(id) {
  return request(`/wallets/${id}/archive`, { method: "PATCH" });
}

export function restoreWallet(id) {
  return request(`/wallets/${id}/restore`, { method: "PATCH" });
}

export function setPrimaryWallet(id) {
  return request(`/wallets/${id}/primary`, { method: "PATCH" });
}

export function adjustWalletBalance(id, payload) {
  return request(`/wallets/${id}/adjustments`, { method: "POST", body: JSON.stringify(payload) });
}

export function transferBetweenWallets(payload) {
  return request("/wallets/transfers", { method: "POST", body: JSON.stringify(payload) });
}

export function previewWalletConsolidation(payload) {
  return request("/wallets/consolidation/preview", { method: "POST", body: JSON.stringify(payload) });
}

export function consolidateWallet(payload) {
  return request("/wallets/consolidation", { method: "POST", body: JSON.stringify(payload) });
}

export function updateTutorialProgress(tutorial, version) {
  return request(`/auth/me/tutorials/${tutorial}`, {
    method: "PATCH",
    body: JSON.stringify({ version })
  });
}

export function createTransactionBatch(payload) {
  return request("/transactions/batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTransaction(id, payload) {
  return request(`/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteTransaction(id) {
  return request(`/transactions/${id}`, { method: "DELETE" });
}

export function listInvoices({ includeItems = true, ids = [], signal } = {}) {
  const params = new URLSearchParams();
  if (!includeItems) params.set("include_items", "false");
  ids.forEach((id) => params.append("ids", String(id)));
  const query = params.toString();
  return request(`/invoices${query ? `?${query}` : ""}`, { signal });
}

export function getInvoice(id, { signal } = {}) {
  return request(`/invoices/${id}`, { signal });
}

export function listCards(active, { signal } = {}) {
  const query = active === undefined ? "" : `?active=${active ? "true" : "false"}`;
  return request(`/cards${query}`, { signal });
}

export function createCard(payload) {
  return request("/cards", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateCard(id, payload) {
  return request(`/cards/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function toggleCard(id) {
  return request(`/cards/${id}/toggle`, { method: "PATCH" });
}

export function deleteCard(id) {
  return request(`/cards/${id}`, { method: "DELETE" });
}

export function getCurrentCardInvoice(id) {
  return request(`/cards/${id}/invoices/current`);
}

export function createCardPurchase(cardId, payload) {
  return request(`/cards/${cardId}/purchases`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listCardSubscriptions() {
  return request("/card-subscriptions");
}

export function previewCardSubscription(payload) {
  return request("/card-subscriptions/preview", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCardSubscription(subscriptionId, payload) {
  return request(`/card-subscriptions/${subscriptionId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function cancelCardSubscription(subscriptionId) {
  return request(`/card-subscriptions/${subscriptionId}`, { method: "DELETE" });
}

export function getCategoryBreakdown(year, month, { includeDetails = false, signal } = {}) {
  const query = includeDetails ? "?include_details=true" : "";
  return request(`/months/${year}/${month}/categories${query}`, { signal });
}

export function getMonthlyBudgetPlan(year, month, { signal } = {}) {
  return request(`/budget-plans/${year}/${month}`, { signal });
}

export function updateMonthlyBudgetPlan(year, month, payload) {
  return request(`/budget-plans/${year}/${month}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function updateBudgetReserveRule(year, month, payload) {
  return request(`/budget-plans/${year}/${month}/reserve-rule`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function listCategories({ signal } = {}) {
  return request("/categories", { signal });
}

export function createCategory(payload) {
  return request("/categories", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateCategory(id, payload) {
  return request(`/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteCategory(id) {
  return request(`/categories/${id}`, { method: "DELETE" });
}

export function updateInvoice(id, payload) {
  return request(`/invoices/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteInvoice(invoiceId) {
  return request(`/invoices/${invoiceId}`, { method: "DELETE" });
}

export function addInvoiceItem(invoiceId, payload) {
  return request(`/invoices/${invoiceId}/items`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateInvoiceItem(invoiceId, itemId, payload) {
  return request(`/invoices/${invoiceId}/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteInvoiceItem(invoiceId, itemId) {
  return request(`/invoices/${invoiceId}/items/${itemId}`, {
    method: "DELETE" }
  );
}

export function setInvoicePaid(invoiceId, paid) {
  return request(`/invoices/${invoiceId}/paid`, {
    method: "PATCH",
    body: JSON.stringify({ paid })
  });
}

export function listInstallments() {
  return request("/installments");
}

export function listInstallmentPage({ tab = "active", search = "", categoryIds = [], creditCardId = "", situation = "all", sortBy = "nextDue", page = 1, pageSize = 12 } = {}) {
  const params = new URLSearchParams({
    tab,
    search,
    situation,
    sort_by: sortBy,
    page: String(page),
    page_size: String(pageSize)
  });
  categoryIds.forEach((categoryId) => params.append("category_ids", String(categoryId)));
  if (creditCardId) params.set("credit_card_id", String(creditCardId));
  return request(`/installments/page?${params}`);
}

export function listReceivables({ signal } = {}) {
  return request("/receivables", { signal });
}

export function listReceivableExpenseOptions({ signal } = {}) {
  return request("/receivables/expense-options", { signal });
}

export function listLinkedReceivableTransactions({ signal } = {}) {
  return request("/receivables/linked-transactions", { signal });
}

export function listReceivablePeople({ signal } = {}) {
  return request("/receivables/people", { signal });
}

export function createReceivablePerson(payload) {
  return request("/receivables/people", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createReceivable(payload) {
  return request("/receivables", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateReceivable(id, payload) {
  return request(`/receivables/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteReceivable(id) {
  return request(`/receivables/${id}`, { method: "DELETE" });
}

export function markReceivablePaid(id, payload) {
  return request(`/receivables/${id}/paid`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function createReceivablePayment(id, payload) {
  return request(`/receivables/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteReceivablePayment(receivableId, paymentId) {
  return request(`/receivables/${receivableId}/payments/${paymentId}`, { method: "DELETE" });
}

export function getInstallment(id) {
  return request(`/installments/${id}`);
}

export function createInstallment(payload) {
  return request("/installments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateInstallmentCategory(id, categoryIds) {
  return request(`/installments/${id}/category`, {
    method: "PATCH",
    body: JSON.stringify({ category_ids: (categoryIds || []).map(Number) })
  });
}

export function deleteInstallment(id) {
  return request(`/installments/${id}`, { method: "DELETE" });
}

export function updateInstallmentItem(itemId, payload) {
  return request(`/installments/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteInstallmentItem(itemId) {
  return request(`/installments/items/${itemId}`, { method: "DELETE" });
}

export function listRecurrences() {
  return request("/recurrences");
}

export function createRecurrence(payload) {
  return request("/recurrences", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateRecurrence(id, payload) {
  return request(`/recurrences/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function listSimulations() {
  return request("/simulations");
}

export function previewSimulation(payload) {
  return request("/simulations/preview", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getSimulation(id) {
  return request(`/simulations/${id}`);
}

export function createSimulation(payload) {
  return request("/simulations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateSimulation(id, payload) {
  return request(`/simulations/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteSimulation(id) {
  return request(`/simulations/${id}`, { method: "DELETE" });
}
