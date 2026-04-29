const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "finance-token";

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
    const message = await response.text();
    throw new Error(message || "Request failed");
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

export function getMonth(year, month) {
  return request(`/months/${year}/${month}`);
}

export function getMonthSummary(year, month) {
  return request(`/months/${year}/${month}/summary`);
}

export function getMonthsSummary() {
  return request("/months/summary");
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

export function updateTransaction(id, payload) {
  return request(`/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteTransaction(id) {
  return request(`/transactions/${id}`, { method: "DELETE" });
}

export function listInvoices() {
  return request("/invoices");
}

export function listInvoiceTemplates(active) {
  const query = active === undefined ? "" : `?active=${active ? "true" : "false"}`;
  return request(`/invoice-templates${query}`);
}

export function createInvoiceTemplate(payload) {
  return request("/invoice-templates", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateInvoiceTemplate(id, payload) {
  return request(`/invoice-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function toggleInvoiceTemplate(id) {
  return request(`/invoice-templates/${id}/toggle`, { method: "PATCH" });
}

export function deleteInvoiceTemplate(id) {
  return request(`/invoice-templates/${id}`, { method: "DELETE" });
}

export function createInvoice(payload) {
  return request("/invoices", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function addInvoiceItem(invoiceId, payload) {
  return request(`/invoices/${invoiceId}/items`, {
    method: "POST",
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

export function listReceivables() {
  return request("/receivables");
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

export function getInstallment(id) {
  return request(`/installments/${id}`);
}

export function createInstallment(payload) {
  return request("/installments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteInstallment(id) {
  return request(`/installments/${id}`, { method: "DELETE" });
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
