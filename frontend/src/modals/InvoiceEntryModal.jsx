import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Layers3, Loader2, ReceiptText, X } from "lucide-react";

import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InvoiceEntryModal({ invoice, kind = "expense", categories = [], onCreateCategory, onOpenInstallment, onSave, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const isRefund = kind === "refund";
  const [form, setForm] = useState({ description: "", amount: "", category_ids: [] });
  const [saving, setSaving] = useState(false);
  const amount = parseTypedMoneyInput(form.amount, language);
  const canSave = Boolean((form.description.trim() || isRefund) && amount > 0 && !saving);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (document.querySelector(".category-modal-layer")) return;
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        description: form.description.trim() || copy("Reembolso", "Refund"),
        amount: isRefund ? -Math.abs(amount) : Math.abs(amount),
        category_ids: form.category_ids.map(Number),
      });
    } catch {
      // A página exibe o erro e mantém os dados para uma nova tentativa.
    } finally {
      setSaving(false);
    }
  };

  const title = isRefund ? copy("Adicionar reembolso", "Add refund") : copy("Adicionar item", "Add item");

  return createPortal(
    <div className="modal-layer transaction-modal-layer invoice-entry-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form className={`modal-card transaction-modal invoice-entry-modal ${isRefund ? "refund" : "expense"}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="invoice-entry-modal-title">
        <div className="modal-titlebar">
          <div className="invoice-entry-heading">
            <p className="eyebrow">{invoice.name}</p>
            <h2 id="invoice-entry-modal-title">{title}</h2>
          </div>
          {!isRefund && onOpenInstallment && (
            <div className="transaction-mode-switch" aria-label={copy("Tipo de compra", "Purchase type")}>
              <button className="active" type="button" aria-pressed="true"><ReceiptText size={15} /> {copy("Compra única", "One-time purchase")}</button>
              <button type="button" aria-pressed="false" onClick={onOpenInstallment}><Layers3 size={15} /> {copy("Compra parcelada", "Installment purchase")}</button>
            </div>
          )}
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={copy("Fechar", "Close")}>
            <X size={18} />
          </button>
        </div>

        <div className="transaction-modal-body invoice-entry-modal-body">
          <label className="invoice-entry-description">
            <span>{copy("Descrição", "Description")}</span>
            <input
              maxLength={255}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder={isRefund ? copy("Opcional. Ex: estorno ou devolução", "Optional. Ex: reversal or return") : copy("Ex: supermercado, restaurante...", "Ex: groceries, restaurant...")}
            />
          </label>

          <label>
            <span>{copy("Categoria", "Category")}</span>
            <CategorySelect
              categories={categories}
              values={form.category_ids}
              onChange={(category_ids) => setForm((current) => ({ ...current, category_ids }))}
              onCreate={onCreateCategory}
            />
          </label>

          <label className="amount-field">
            <span>{copy("Valor", "Amount")}</span>
            <div className={`money-input ${isRefund ? "success" : "danger"}`}>
              <span>R$</span>
              <input
                inputMode="decimal"
                value={form.amount.replace(/^R\$\s?/, "")}
                onChange={(event) => setForm((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))}
                onBlur={() => setForm((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))}
                aria-label={copy("Valor", "Amount")}
              />
            </div>
          </label>

          <div className="transaction-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{copy("Cancelar", "Cancel")}</button>
            <button className={`btn transaction-save ${isRefund ? "success" : "danger"}`} type="submit" disabled={!canSave}>
              {saving ? <><Loader2 className="spin" size={16} /> {copy("Adicionando...", "Adding...")}</> : title}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
