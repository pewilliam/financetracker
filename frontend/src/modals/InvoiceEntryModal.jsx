import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMinus, Layers3, Loader2, ReceiptText, ShoppingBag, X } from "lucide-react";

import { isMobileViewport } from "../app/helpers.js";
import CategorySelect from "../components/CategorySelect.jsx";
import DateField from "../components/DateField.jsx";
import { useI18n } from "../i18n/index.ts";
import { todayIsoDate } from "../app/helpers.js";
import { formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InvoiceEntryModal({ invoice, cards = [], cardId = "", kind = "expense", categories = [], onCreateCategory, onOpenInstallment, onSave, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const isRefund = kind === "refund";
  const lockedCardId = String(invoice?.credit_card_id || cardId || "");
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category_ids: [],
    credit_card_id: lockedCardId,
    purchase_date: todayIsoDate()
  });
  const [saving, setSaving] = useState(false);
  const amountInputRef = useRef(null);
  const amount = parseTypedMoneyInput(form.amount, language);
  const selectedCard = cards.find((card) => String(card.id) === String(form.credit_card_id));
  const canSave = Boolean((form.description.trim() || isRefund) && amount > 0 && !saving && (isRefund || (form.credit_card_id && form.purchase_date)));
  const hasModeSwitch = !isRefund && Boolean(onOpenInstallment);

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
      await onSave(isRefund ? {
        description: form.description.trim() || copy("Reembolso", "Refund"),
        amount: -Math.abs(amount),
        category_ids: form.category_ids.map(Number),
      } : {
        description: form.description.trim(),
        amount: Math.abs(amount),
        category_ids: form.category_ids.map(Number),
        credit_card_id: Number(form.credit_card_id),
        purchase_date: form.purchase_date,
      });
    } catch {
      // A página exibe o erro e mantém os dados para uma nova tentativa.
    } finally {
      setSaving(false);
    }
  };

  const title = isRefund ? copy("Adicionar reembolso", "Add refund") : copy("Adicionar compra", "Add purchase");
  const heading = isRefund
    ? copy(`FATURA · ${invoice?.name || ""}`, `INVOICE · ${invoice?.name || ""}`)
    : copy(`CARTÃO · ${selectedCard?.name || invoice?.name || "COMPRA"}`, `CARD · ${selectedCard?.name || invoice?.name || "PURCHASE"}`);

  return createPortal(
    <div className="modal-layer transaction-modal-layer invoice-entry-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form className={`modal-card transaction-modal invoice-entry-modal ${isRefund ? "refund" : "expense"}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="invoice-entry-modal-title">
        <header className={`transaction-entry-titlebar invoice-entry-titlebar ${hasModeSwitch ? "" : "compact"}`}>
          <span className="transaction-entry-icon">{isRefund ? <CircleMinus size={21} /> : <ShoppingBag size={21} />}</span>
          <div className="transaction-entry-heading">
            <p>{heading}</p>
            <h2 id="invoice-entry-modal-title">{title}</h2>
          </div>
          {hasModeSwitch && (
            <div className="transaction-mode-switch" aria-label={copy("Tipo de compra", "Purchase type")}>
              <button className="active" type="button" aria-pressed="true"><ReceiptText size={15} /> {copy("Compra única", "One-time purchase")}</button>
              <button type="button" aria-pressed="false" onClick={onOpenInstallment}><Layers3 size={15} /> {copy("Compra parcelada", "Installment purchase")}</button>
            </div>
          )}
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
          {!isRefund && (
            <>
              {!lockedCardId && (
                <div className="invoice-entry-category">
                  <span>{copy("Cartão", "Card")}</span>
                  <CategorySelect
                    categories={cards.filter((card) => card.active).map((card) => ({ id: card.id, name: card.name, color: card.color }))}
                    value={form.credit_card_id}
                    onChange={(credit_card_id) => setForm((current) => ({ ...current, credit_card_id }))}
                    multiple={false}
                    clearable={false}
                    placeholder={copy("Selecione o cartão", "Select the card")}
                    searchPlaceholder={copy("Buscar cartão...", "Search card...")}
                    ariaLabel={copy("Cartão", "Card")}
                  />
                </div>
              )}
              <div className="invoice-entry-description">
                <span>{copy("Data da compra", "Purchase date")}</span>
                <DateField value={form.purchase_date} onChange={(purchase_date) => setForm((current) => ({ ...current, purchase_date }))} />
                <small>{copy("A fatura é escolhida pelo fechamento do cartão.", "The invoice is chosen from the card closing calendar.")}</small>
              </div>
            </>
          )}

        </div>
        <footer className="transaction-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{copy("Cancelar", "Cancel")}</button>
          <button className={`btn transaction-save ${isRefund ? "success" : "danger"}`} type="submit" disabled={!canSave}>
            {saving ? <><Loader2 className="spin" size={16} /> {copy("Adicionando...", "Adding...")}</> : title}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
