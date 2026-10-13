import { isInvoiceTransaction } from "../../app/helpers.js";

export function entriesForDay(day) {
  return [
    ...(day?.transactions || []).map(item => ({ key: `transaction-${item.id}`, kind: "transaction", item })),
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
  return { kind, invoice, label, title, amount: planned ? item.remaining_amount : item.amount, metadata: metadata.filter(Boolean).join(" · ") };
}
