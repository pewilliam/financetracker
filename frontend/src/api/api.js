const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
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

export function getMonth(year, month) {
  return request(`/months/${year}/${month}`);
}

export function getMonthSummary(year, month) {
  return request(`/months/${year}/${month}/summary`);
}

export function applyRecurrences(year, month) {
  return request(`/months/${year}/${month}/apply-recurrences`, {
    method: "POST"
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

export function listRecurrences() {
  return request("/recurrences");
}

export function createRecurrence(payload) {
  return request("/recurrences", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
