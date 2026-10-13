import { isInvoiceTransaction } from "../../app/helpers.js";

export function entriesForDay(day, invoices = []) {
  return [
    ...(day?.transactions || []).map(item => ({ key: `transaction-${item.id}`, kind: "transaction", item, invoice: invoices.find(invoice => invoice.id === item.invoice_id) })),
    ...(day?.planned_receivables || []).map(item => ({ key: `receivable-${item.id}`, kind: "receivable", item })),
  ];
}

export function describeEntry(entry, language) {
  const { item } = entry;
  const english = language === "en-US";
  const planned = entry.kind === "receivable";
  const invoice = !planned && isInvoiceTransaction(item);
  const kind = planned ? "planned" : item.type === "income" ? "income" : "expense";
  const label = planned ? (english ? "Expected receivable" : "Recebível previsto")
    : invoice ? (english ? "Invoice" : "Fatura")
    : kind === "income" ? (english ? "Income" : "Ganho") : (english ? "Expense" : "Gasto");
  const title = item.description || (english ? "No description" : "Sem descrição");
  const categories = item.categories?.length ? item.categories : item.category ? [item.category] : [];
  const metadata = [label, planned ? item.person_name : categories.map(category => category.name).join(", ")];
  if (item.recurrence_id) metadata.push(english ? "Recurring" : "Recorrente");
  if (planned && item.series_installment_count > 1) metadata.push(`${item.series_installment_number}/${item.series_installment_count}`);
  const paid = planned ? item.status === "paid" || Number(item.remaining_amount) <= 0 : invoice && Boolean(entry.invoice?.paid);
  const status = planned || invoice ? (paid ? "paid" : "pending") : null;
  const statusLabel = status === "paid" ? (english ? "Paid" : "Pago") : status ? (english ? "Pending" : "Pendente") : null;
  return { kind, invoice, label, title, amount: planned ? item.remaining_amount : item.amount, status, statusLabel, metadata: metadata.filter(Boolean).join(" · ") };
}

const cents = value => Math.round(Number(value || 0) * 100);

export function dailyTotals(day) {
  const totals = (day.transactions || []).reduce((result, item) => {
    result[item.type === "income" ? "income" : "expense"] += cents(item.amount);
    return result;
  }, { income: 0, expense: 0 });
  return {
    income: day.income == null ? totals.income / 100 : Number(day.income),
    expense: day.expenses == null ? totals.expense / 100 : Number(day.expenses),
    planned: (day.planned_receivables || []).reduce((sum, item) => sum + cents(item.remaining_amount), 0) / 100,
  };
}

export function calendarDays(days, year, month, openingBalance = 0) {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const existing = new Map(days.filter(day => day.date.startsWith(prefix)).map(day => [day.date.slice(0, 10), day]));
  let previous = cents(openingBalance);
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
    const date = prefix + String(index + 1).padStart(2, "0");
    const day = existing.get(date) || {date, transactions: [], planned_receivables: []};
    const totals = dailyTotals(day);
    const balance = day.balance == null ? previous + cents(totals.income) - cents(totals.expense) : cents(day.balance);
    const variation = (balance - previous) / 100;
    previous = balance;
    return {...day, date, balance: balance / 100, variation, totals};
  });
}

export function moveCalendarEntry(days, entry, fromDate, toDate) {
  if (fromDate === toDate || !days.some(day => day.date.slice(0, 10) === toDate)) return days;
  const planned = entry.kind === "receivable";
  const amount = cents(planned ? entry.item.remaining_amount : entry.item.amount) / 100;
  const effect = planned || entry.item.type === "income" ? amount : -amount;
  return days.map(day => {
    const date = day.date.slice(0, 10);
    const balanceChange = effect * (Number(date >= toDate) - Number(date >= fromDate));
    const totals = dailyTotals(day);
    const change = date === fromDate ? -amount : date === toDate ? amount : 0;
    const field = planned ? "planned_receivables" : "transactions";
    let items = day[field] || [];
    if (date === fromDate) items = items.filter(item => item.id !== entry.item.id);
    if (date === toDate) items = [...items, {...entry.item, ...(planned ? {due_date: toDate} : {date: toDate})}];
    return {...day, [field]: items,
      income: totals.income + (!planned && entry.item.type === "income" ? change : 0),
      expenses: totals.expense + (!planned && entry.item.type !== "income" ? change : 0),
      ...(day.balance == null ? {} : {balance: Number(day.balance) + (planned ? 0 : balanceChange)}),
      ...(day.projected_balance == null ? {} : {projected_balance: Number(day.projected_balance) + balanceChange}),
    };
  });
}
