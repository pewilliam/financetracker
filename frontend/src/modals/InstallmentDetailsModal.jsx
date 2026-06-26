import { useMemo, useState } from "react";
import { Check, CreditCard, Pencil, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { invoiceAcceptsNewCharges } from "../app/helpers.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InstallmentDetailsModal({ purchase, invoices, onClose, onDelete, onSaveItem }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ amount: "", invoice_id: "" });
  const [savingId, setSavingId] = useState(null);
  const selectableInvoices = useMemo(() => invoices.filter(invoiceAcceptsNewCharges), [invoices]);
  const sortedInvoices = useMemo(() => [...selectableInvoices].sort((a, b) => a.due_date.localeCompare(b.due_date)), [selectableInvoices]);
  const invoicesById = useMemo(() => new Map(selectableInvoices.map((invoice) => [String(invoice.id), invoice])), [selectableInvoices]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setDraft({
      amount: formatMoney(item.amount, language),
      invoice_id: item.invoice_id ? String(item.invoice_id) : ""
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ amount: "", invoice_id: "" });
  };

  const saveEdit = async (item) => {
    const amount = parseTypedMoneyInput(draft.amount, language);
    if (amount <= 0) return;
    setSavingId(item.id);
    try {
      await onSaveItem(item.id, {
        amount,
        invoice_id: draft.invoice_id ? Number(draft.invoice_id) : null
      });
      cancelEdit();
    } finally {
      setSavingId(null);
    }
  };

  const invoiceLabel = (invoice) => `${invoice.name} - ${formatDateShort(invoice.due_date, language)}`;

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <div className="modal-card invoice-modal installment-modal step-2">
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div><p className="eyebrow">{purchase.progress_label}</p><h2>{purchase.description}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-review">
          <div className="review-table">
            <div className="review-row installment-review-head installment-details-row"><span>#</span><span>{tt("installmentModal.installment", "Parcela")}</span><span>{tt("installmentModal.invoice", "Fatura")}</span><span>{tt("installmentModal.status", "Status")}</span><span /></div>
            <div className="review-list">
              {purchase.items.map((item) => {
                const isEditing = editingId === item.id;
                const selectedInvoice = isEditing ? invoicesById.get(String(draft.invoice_id)) : item.invoice;
                const canEditItem = !item.invoice || invoiceAcceptsNewCharges(item.invoice);
                const saveDisabled = savingId === item.id || parseTypedMoneyInput(draft.amount, language) <= 0 || (draft.invoice_id && !selectedInvoice);
                return (
                  <div className="review-row installment-review-row installment-details-row" key={item.id}>
                    <span>{item.installment_number}/{purchase.installment_count}</span>
                    {isEditing ? (
                      <input
                        inputMode="decimal"
                        value={draft.amount}
                        onChange={(event) => setDraft((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))}
                        onBlur={() => setDraft((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))}
                      />
                    ) : (
                      <strong>{formatMoney(item.amount)}</strong>
                    )}
                    {isEditing ? (
                      <select value={draft.invoice_id} onChange={(event) => setDraft((current) => ({ ...current, invoice_id: event.target.value }))}>
                        <option value="">Sem fatura</option>
                        {sortedInvoices.map((invoice) => <option value={invoice.id} key={invoice.id}>{invoiceLabel(invoice)}</option>)}
                      </select>
                    ) : (
                      <span>{item.invoice ? invoiceLabel(item.invoice) : "Fatura removida - realocar"}</span>
                    )}
                    <span className={`due-badge compact ${selectedInvoice?.paid ? "paid" : selectedInvoice ? "" : "danger"}`}>{selectedInvoice?.paid ? tt("installmentModal.paid", "Paga") : selectedInvoice ? tt("installmentModal.pending", "Pendente") : tt("installmentModal.orphan", "Órfã")}</span>
                    <span className="installment-row-actions">
                      {isEditing ? (
                        <>
                          <button className="icon-btn small" type="button" onClick={() => saveEdit(item)} disabled={saveDisabled} aria-label="Salvar parcela"><Check size={15} /></button>
                          <button className="icon-btn small" type="button" onClick={cancelEdit} disabled={savingId === item.id} aria-label="Cancelar edição"><X size={15} /></button>
                        </>
                      ) : canEditItem ? (
                        <button className="icon-btn small" type="button" onClick={() => startEdit(item)} aria-label="Editar parcela"><Pencil size={15} /></button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-actions details-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("installmentModal.close", "Fechar")}</button>
          <button className="btn btn-ghost danger-text" type="button" onClick={() => onDelete(purchase.id)}><Trash2 size={16} /> {tt("installmentModal.removePurchase", "Remover compra")}</button>
        </div>
      </div>
    </div>
  );
}


