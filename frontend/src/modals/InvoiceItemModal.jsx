import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMinus, Link2, Loader2, Pencil, ShoppingBag, X } from "lucide-react";

import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InvoiceItemModal({ invoice, item, categories = [], expenseOption, onManageReceivable, onCreateCategory, onSave, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const [form, setForm] = useState(() => ({
    description: item.description || "",
    amount: formatMoney(Math.abs(Number(item.amount || 0)), language),
    category_ids: (item.category_ids?.length ? item.category_ids : item.category_id ? [item.category_id] : []).map(String),
    kind: Number(item.amount) < 0 ? "refund" : "expense",
  }));
  const [saving, setSaving] = useState(false);
  const isRefund = form.kind === "refund";
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
      // A página exibe o erro e mantém o modal aberto para uma nova tentativa.
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-layer invoice-item-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form className={`modal-card invoice-item-edit-modal editing ${isRefund ? "refund" : "expense"}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="invoice-item-modal-title">
        <div className="invoice-item-modal-header">
          <div className="invoice-item-modal-icon"><Pencil size={20} /></div>
          <div>
            <p className="eyebrow">{invoice.name}</p>
            <h2 id="invoice-item-modal-title">{copy("Editar item da fatura", "Edit invoice item")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={copy("Fechar", "Close")}><X size={18} /></button>
        </div>

        <div className="invoice-item-modal-body">
          <div className="invoice-item-kind" aria-label={copy("Tipo do item", "Item type")}>
            <button className={form.kind === "expense" ? "active expense" : ""} type="button" onClick={() => setForm((current) => ({ ...current, kind: "expense" }))}>
              <ShoppingBag size={16} /> {copy("Gasto", "Expense")}
            </button>
            <button className={form.kind === "refund" ? "active refund" : ""} type="button" onClick={() => setForm((current) => ({ ...current, kind: "refund" }))}>
              <CircleMinus size={16} /> {copy("Reembolso", "Refund")}
            </button>
          </div>

          <label className="invoice-item-description-field">
            <span>{copy("Descrição", "Description")}</span>
            <input maxLength={255} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={isRefund ? copy("Opcional. Ex: estorno ou devolução", "Optional. Ex: reversal or return") : copy("Ex: supermercado, restaurante...", "Ex: groceries, restaurant...")} />
          </label>

          <label>
            <span>{copy("Categoria", "Category")}</span>
            <CategorySelect categories={categories} values={form.category_ids} onChange={(category_ids) => setForm((current) => ({ ...current, category_ids }))} onCreate={onCreateCategory} />
          </label>

          <label>
            <span>{copy("Valor", "Amount")}</span>
            <div className={`invoice-item-money ${form.kind}`}>
              <span>R$</span>
              <input
                inputMode="decimal"
                value={form.amount.replace(/^R\$\s?/, "")}
                onChange={(event) => setForm((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))}
                onBlur={() => setForm((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))}
              />
            </div>
          </label>

          {Number(item.amount) > 0 && expenseOption && (
            <section className="expense-receivable-action">
              <div>
                <strong><Link2 size={16} /> Recebimento associado</strong>
                <small>{expenseOption.receivable_ids?.length ? `${formatMoney(expenseOption.linked_amount, language)} já associado` : "Outra pessoa pagará todo ou parte deste gasto?"}</small>
              </div>
              <button className="btn btn-ghost compact" type="button" onClick={() => onManageReceivable?.(expenseOption)}>
                {expenseOption.receivable_ids?.length ? "Editar recebível" : "Associar recebível"}
              </button>
            </section>
          )}
        </div>

        <div className="invoice-item-modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{copy("Cancelar", "Cancel")}</button>
          <button className="btn btn-primary" type="submit" disabled={!canSave}>
            {saving ? <><Loader2 className="spin" size={16} /> {copy("Salvando...", "Saving...")}</> : copy("Salvar alterações", "Save changes")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
