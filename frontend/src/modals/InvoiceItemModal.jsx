import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMinus, Link2, Loader2, Pencil, ShoppingBag, X } from "lucide-react";

import { isMobileViewport } from "../app/helpers.js";
import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

const categoryKey = (ids) => [...ids].map(Number).sort((left, right) => left - right).join(",");
const cents = (value) => Math.round(Math.abs(Number(value || 0)) * 100);

export default function InvoiceItemModal({ invoice, item, categories = [], expenseOption, onManageReceivable, onCreateCategory, onSave, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const original = {
    description: item.description || "",
    kind: Number(item.amount) < 0 ? "refund" : "expense",
    amount: Math.abs(Number(item.amount || 0)),
    category_ids: (item.category_ids?.length ? item.category_ids : item.category_id ? [item.category_id] : []).map(String),
  };
  const [form, setForm] = useState(() => ({
    description: original.description,
    amount: formatMoney(original.amount, language),
    category_ids: original.category_ids,
    kind: original.kind,
  }));
  const [saving, setSaving] = useState(false);
  const amountInputRef = useRef(null);
  const isRefund = form.kind === "refund";
  const amount = parseTypedMoneyInput(form.amount, language);
  const changed = form.description.trim() !== original.description.trim()
    || form.kind !== original.kind
    || cents(amount) !== cents(original.amount)
    || categoryKey(form.category_ids) !== categoryKey(original.category_ids);
  const canSave = Boolean((form.description.trim() || isRefund) && amount > 0 && changed && !saving);

  useEffect(() => {
    if (isMobileViewport()) return undefined;
    const focusFrame = requestAnimationFrame(() => amountInputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(focusFrame);
  }, []);

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
    <div className="modal-layer transaction-modal-layer invoice-entry-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form
        className={`modal-card transaction-modal invoice-entry-modal invoice-item-edit-modal ${isRefund ? "refund" : "expense"}`}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-item-modal-title"
      >
        <header className="transaction-entry-titlebar invoice-entry-titlebar">
          <span className="transaction-entry-icon"><Pencil size={20} /></span>
          <div className="transaction-entry-heading">
            <p>{copy(`FATURA · ${invoice.name}`, `INVOICE · ${invoice.name}`)}</p>
            <h2 id="invoice-item-modal-title">{copy("Editar item", "Edit item")}</h2>
          </div>
          <div className="transaction-mode-switch" aria-label={copy("Tipo do item", "Item type")}>
            <button
              className={isRefund ? "" : "active"}
              type="button"
              aria-pressed={!isRefund}
              onClick={() => setForm((current) => ({ ...current, kind: "expense" }))}
            >
              <ShoppingBag size={15} /> {copy("Gasto", "Expense")}
            </button>
            <button
              className={isRefund ? "active" : ""}
              type="button"
              aria-pressed={isRefund}
              onClick={() => setForm((current) => ({ ...current, kind: "refund" }))}
            >
              <CircleMinus size={15} /> {copy("Reembolso", "Refund")}
            </button>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={copy("Fechar", "Close")}>
            <X size={18} />
          </button>
        </header>

        <div className="transaction-modal-body invoice-entry-modal-body">
          <div className="amount-field">
            <span>{copy("Valor", "Amount")}</span>
            <div className={`money-input ${isRefund ? "success" : "danger"}`}>
              <span>R$</span>
              <input
                ref={amountInputRef}
                inputMode="decimal"
                value={form.amount.replace(/^R\$\s?/, "")}
                onChange={(event) => setForm((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))}
                onBlur={() => setForm((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))}
                onFocus={(event) => event.target.select()}
                aria-label={copy("Valor", "Amount")}
              />
            </div>
          </div>

          <div className="invoice-entry-description">
            <span>{copy("Descrição", "Description")}</span>
            <input
              maxLength={255}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder={isRefund ? copy("Opcional. Ex: estorno ou devolução", "Optional. Ex: reversal or return") : copy("Ex: supermercado, restaurante...", "Ex: groceries, restaurant...")}
            />
          </div>

          <div className="invoice-entry-category">
            <span>{copy("Categoria", "Category")}</span>
            <CategorySelect
              categories={categories}
              values={form.category_ids}
              onChange={(category_ids) => setForm((current) => ({ ...current, category_ids }))}
              onCreate={onCreateCategory}
            />
          </div>

          {!isRefund && expenseOption && (
            <section className="expense-receivable-action">
              <div>
                <strong><Link2 size={16} /> {copy("Recebimento associado", "Linked receivable")}</strong>
                <small>
                  {expenseOption.receivable_ids?.length
                    ? copy(`${formatMoney(expenseOption.linked_amount, language)} já associado`, `${formatMoney(expenseOption.linked_amount, language)} already linked`)
                    : copy("Outra pessoa pagará todo ou parte deste gasto?", "Will someone else pay part of this expense?")}
                </small>
              </div>
              <button className="btn btn-ghost compact" type="button" onClick={() => onManageReceivable?.(expenseOption)}>
                {expenseOption.receivable_ids?.length ? copy("Editar recebível", "Edit receivable") : copy("Associar recebível", "Link receivable")}
              </button>
            </section>
          )}
        </div>

        <footer className="transaction-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{copy("Cancelar", "Cancel")}</button>
          <button className="btn btn-primary transaction-save" type="submit" disabled={!canSave}>
            {saving
              ? <><Loader2 className="spin" size={16} /> {copy("Salvando...", "Saving...")}</>
              : copy("Salvar alterações", "Save changes")}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
