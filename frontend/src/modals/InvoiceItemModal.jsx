import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMinus, Link2, Loader2, Pencil, ShoppingBag, X } from "lucide-react";

import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";


export default function InvoiceItemModal({ invoice, item, categories = [], expenseOption, onManageReceivable, onCreateCategory, onSave, onClose }) {
  const { language } = useI18n();
  const [form, setForm] = useState(() => ({
    description: item.description || "",
    amount: formatMoney(Math.abs(Number(item.amount || 0)), language),
    category_id: item.category_id ? String(item.category_id) : "",
    kind: Number(item.amount) < 0 ? "refund" : "expense",
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (document.querySelector(".category-modal-layer")) return;
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, saving]);

  const amount = parseTypedMoneyInput(form.amount, language);
  const canSave = Boolean(form.description.trim() && amount > 0 && !saving);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        description: form.description.trim(),
        amount: form.kind === "refund" ? -Math.abs(amount) : Math.abs(amount),
        category_id: form.category_id ? Number(form.category_id) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-layer invoice-item-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label="Fechar" />
      <form className="modal-card invoice-item-edit-modal" onSubmit={submit}>
        <div className="invoice-item-modal-header">
          <div className="invoice-item-modal-icon"><Pencil size={20} /></div>
          <div>
            <p className="eyebrow">{invoice.name}</p>
            <h2>Editar item da fatura</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="invoice-item-modal-body">
          <div className="invoice-item-kind" aria-label="Tipo do item">
            <button className={form.kind === "expense" ? "active expense" : ""} type="button" onClick={() => setForm({ ...form, kind: "expense" })}>
              <ShoppingBag size={16} /> Gasto
            </button>
            <button className={form.kind === "refund" ? "active refund" : ""} type="button" onClick={() => setForm({ ...form, kind: "refund" })}>
              <CircleMinus size={16} /> Reembolso
            </button>
          </div>

          <label className="invoice-item-description-field">
            <span>Descrição</span>
            <input autoFocus maxLength={255} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex: supermercado, restaurante..." />
          </label>

          <label>
            <span>Categoria</span>
            <CategorySelect categories={categories} value={form.category_id} onChange={(value) => setForm({ ...form, category_id: value })} onCreate={onCreateCategory} />
          </label>

          <label>
            <span>Valor</span>
            <div className={`invoice-item-money ${form.kind}`}>
              <span>R$</span>
              <input
                inputMode="decimal"
                value={form.amount.replace(/^R\$\s?/, "")}
                onChange={(event) => setForm({ ...form, amount: formatTypedMoneyForEditing(event.target.value, language) })}
                onBlur={() => setForm({ ...form, amount: formatTypedMoneyAsCurrency(form.amount, language) })}
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
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" type="submit" disabled={!canSave}>
            {saving ? <><Loader2 className="spin" size={16} /> Salvando...</> : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
