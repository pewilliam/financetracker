import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Layers3, ReceiptText, Repeat2, Trash2, X } from "lucide-react";
import CategorySelect from "../components/CategorySelect.jsx";
import DateField from "../components/DateField.jsx";
import { useI18n } from "../i18n/index.ts";
import { addMonthsToDate, dueMonthWithinFirstInstallmentWindow, firstInstallmentInvoiceOptions, formatMonthShort, invoicePeriod, latestFirstInstallmentPurchaseDate, normalizeInvoiceColor } from "../app/helpers.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InstallmentModal({ form, setForm, cards = [], categories = [], onCreateCategory, onOpenSingle, onOpenSubscription, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const activeCards = useMemo(() => cards.filter((card) => card.active), [cards]);
  const updateForm = (patch) => setForm({ ...form, ...patch });
  const count = Math.min(48, Math.max(1, Number(form.installment_count) || 1));
  const total = parseTypedMoneyInput(form.total_amount, language);
  const totalCents = Math.round(total * 100);
  const baseInstallmentCents = count ? Math.floor(totalCents / count) : 0;
  const lastInstallmentCents = count ? totalCents - (baseInstallmentCents * (count - 1)) : 0;
  const hasRoundingAdjustment = count > 1 && totalCents % count !== 0;
  const installmentAmount = baseInstallmentCents / 100;
  const adjustedLastInstallmentAmount = lastInstallmentCents / 100;
  const selectedCard = activeCards.find((card) => String(card.id) === String(form.credit_card_id));
  const firstInvoiceOptions = selectedCard?.closing_day && selectedCard?.due_day
    ? firstInstallmentInvoiceOptions(selectedCard.closing_day, selectedCard.due_day)
    : [];
  const maxFirstPurchaseDate = selectedCard?.closing_day && selectedCard?.due_day
    ? latestFirstInstallmentPurchaseDate(selectedCard.closing_day, selectedCard.due_day)
    : "";
  const firstDueDate = selectedCard?.closing_day && selectedCard?.due_day && form.first_purchase_date
    ? invoicePeriod(selectedCard.closing_day, selectedCard.due_day, form.first_purchase_date).dueDate
    : "";
  const firstInvoiceAllowed = !firstDueDate || dueMonthWithinFirstInstallmentWindow(firstDueDate);
  const endDate = form.first_purchase_date ? addMonthsToDate(form.first_purchase_date, count - 1) : "";
  const cycleHint = (() => {
    if (!selectedCard?.closing_day || !selectedCard?.due_day || !form.first_purchase_date || !endDate) return "";
    const first = invoicePeriod(selectedCard.closing_day, selectedCard.due_day, form.first_purchase_date);
    const last = invoicePeriod(selectedCard.closing_day, selectedCard.due_day, endDate);
    const closeStart = formatDateShort(first.closingDate, language);
    const dueStart = formatDateShort(first.dueDate, language);
    if (first.dueDate === last.dueDate) {
      return language === "en-US"
        ? `This purchase joins the invoice that closes on ${closeStart} and is due on ${dueStart}.`
        : `Essa compra entra na fatura que fecha em ${closeStart} e vence em ${dueStart}.`;
    }
    const closeEnd = formatDateShort(last.closingDate, language);
    const dueEnd = formatDateShort(last.dueDate, language);
    return language === "en-US"
      ? `Installments join the invoices that close from ${closeStart} to ${closeEnd} and are due from ${dueStart} to ${dueEnd}.`
      : `As parcelas entram nas faturas que fecham de ${closeStart} até ${closeEnd} e vencem de ${dueStart} até ${dueEnd}.`;
  })();

  useEffect(() => {
    if (form.credit_card_id && activeCards.length && !selectedCard) updateForm({ credit_card_id: "" });
  }, [selectedCard, form.credit_card_id, activeCards.length]);

  const handleMoneyChange = (value) => updateForm({ total_amount: formatTypedMoneyForEditing(value, language) });
  const normalizeMoneyField = (field) => updateForm({ [field]: formatTypedMoneyAsCurrency(form[field], language) });

  const buildDrafts = () => Array.from({ length: count }, (_, index) => {
    const purchaseDate = addMonthsToDate(form.first_purchase_date, index);
    const amount = index === count - 1 ? adjustedLastInstallmentAmount : installmentAmount;
    return {
      id: `${Date.now()}-${index}`,
      number: index + 1,
      purchase_date: purchaseDate,
      amount: formatMoney(amount)
    };
  });

  const goToReview = (event) => {
    event.preventDefault();
    if (!form.description || !total || !selectedCard || !form.first_purchase_date || !firstInvoiceAllowed) return;
    setDrafts(buildDrafts());
    setStep(2);
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const removeDraft = (id) => setDrafts((current) => current.filter((draft) => draft.id !== id));
  const confirmedTotal = drafts.reduce((sum, draft) => sum + parseTypedMoneyInput(draft.amount, language), 0);
  const firstDraftAllowed = !drafts[0] || !selectedCard?.closing_day
    ? true
    : dueMonthWithinFirstInstallmentWindow(invoicePeriod(selectedCard.closing_day, selectedCard.due_day, drafts[0].purchase_date).dueDate);
  const canCreate = drafts.length && drafts.every((draft) => parseTypedMoneyInput(draft.amount, language) > 0) && selectedCard && firstDraftAllowed;

  const submitDrafts = (event) => {
    event.preventDefault();
    if (!canCreate) return;
    onSubmit({
      description: form.description,
      total_amount: confirmedTotal,
      installment_count: drafts.length,
      credit_card_id: Number(form.credit_card_id),
      first_purchase_date: form.first_purchase_date,
      category_ids: (form.category_ids || []).map(Number),
      items: drafts.map((draft) => ({
        amount: parseTypedMoneyInput(draft.amount, language),
        purchase_date: draft.purchase_date
      }))
    });
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label={language === "en-US" ? "Close" : "Fechar"} />
      <form className={`modal-card invoice-modal installment-modal step-${step}`} onSubmit={step === 1 ? goToReview : submitDrafts} role="dialog" aria-modal="true" aria-labelledby="installment-modal-title">
        <header className={`transaction-entry-titlebar installment-entry-titlebar ${onOpenSingle ? "" : "compact"}`}>
          <span className="transaction-entry-icon"><Layers3 size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{selectedCard ? `${language === "en-US" ? "CARD" : "CARTÃO"} · ${selectedCard.name}` : (language === "en-US" ? "INSTALLMENT PURCHASE" : "COMPRA PARCELADA")}</p>
            <h2 id="installment-modal-title">{onOpenSingle ? (language === "en-US" ? "Add purchase" : "Adicionar compra") : tt("installmentModal.addInstallmentPurchase", "Adicionar compra parcelada")}</h2>
          </div>
          {onOpenSingle && (
            <div className="transaction-mode-switch columns-3 invoice-entry-mode-switch" aria-label={language === "en-US" ? "Purchase type" : "Tipo de compra"}>
              <button type="button" aria-pressed="false" onClick={onOpenSingle}><ReceiptText size={15} /> {language === "en-US" ? "One-time purchase" : "Compra única"}</button>
              <button type="button" aria-pressed="false" onClick={onOpenSubscription}><Repeat2 size={15} /> {language === "en-US" ? "Subscription" : "Assinatura"}</button>
              <button className="active" type="button" aria-pressed="true"><Layers3 size={15} /> {language === "en-US" ? "Installment purchase" : "Compra parcelada"}</button>
            </div>
          )}
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}><X size={18} /></button>
        </header>
        <div className="invoice-stepper">
          <div className={`stepper-item ${step > 1 ? "done" : "active"}`}><span>{step > 1 ? <Check size={15} /> : "1"}</span><strong>{tt("installmentModal.configure", "Configurar")}</strong></div>
          <i />
          <div className={`stepper-item ${step === 2 ? "active" : ""}`}><span>2</span><strong>{tt("installmentModal.reviewInstallments", "Revisar parcelas")}</strong></div>
        </div>
        {step === 1 ? (
          <>
            <div className="invoice-modal-body">
              <div className="field-label"><span>{tt("installmentModal.purchaseDescription", "Descrição da compra")}</span><input placeholder={tt("installmentModal.purchaseDescriptionPlaceholder", "Ex: PlayStation 5, iPhone, Notebook...")} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} required /></div>
              <div className="invoice-field"><span>Categorias</span><CategorySelect categories={categories} values={form.category_ids || []} onChange={(value) => updateForm({ category_ids: value })} onCreate={onCreateCategory} /></div>
              <div className="installment-form-row">
                <div className="field-label"><span>{tt("installmentModal.totalPurchaseAmount", "Valor total da compra")}</span><input inputMode="decimal" placeholder="R$ 0,00" value={form.total_amount} onChange={(event) => handleMoneyChange(event.target.value)} onBlur={() => normalizeMoneyField("total_amount")} required /></div>
                <div className="field-label"><span>{tt("installmentModal.numberOfInstallments", "Número de parcelas")}</span><input type="number" min="1" max="48" value={form.installment_count ?? ""} onChange={(event) => updateForm({ installment_count: event.target.value })} onBlur={() => updateForm({ installment_count: count })} required /></div>
              </div>
              <div className="installment-per-value" aria-live="polite">
                <strong>{tt("installmentModal.perInstallment", `= ${formatMoney(installmentAmount)} por parcela`, { value: formatMoney(installmentAmount) })}</strong>
                {hasRoundingAdjustment && <small>{`Última parcela será ${formatMoney(adjustedLastInstallmentAmount)} (ajuste de centavos)`}</small>}
              </div>
              <label className={`duplicate-option ${form.different_values ? "active" : ""}`}>
                <input type="checkbox" checked={form.different_values} onChange={(event) => updateForm({ different_values: event.target.checked })} />
                <span className="duplicate-icon"><CreditCard size={20} /></span>
                <span><strong>{tt("installmentModal.differentValues", "Parcelas com valores diferentes")}</strong><small>{tt("installmentModal.editEachValue", "Edite cada valor na revisão.")}</small></span>
              </label>
              <div className="invoice-field">
                <span>{tt("installmentModal.card", "Cartão")}</span>
                <CategorySelect
                  categories={activeCards.map((card) => ({ id: card.id, name: card.name, color: card.color }))}
                  value={form.credit_card_id}
                  onChange={(credit_card_id) => updateForm({ credit_card_id })}
                  multiple={false}
                  clearable={false}
                  placeholder={tt("installmentModal.selectCard", "Selecione o cartão")}
                  searchPlaceholder={tt("installmentModal.searchCard", "Buscar cartão...")}
                  ariaLabel={tt("installmentModal.card", "Cartão")}
                />
              </div>
              <div className="field-label">
                <span>{tt("installmentModal.firstPurchaseDate", "Data da primeira compra")}</span>
                <DateField value={form.first_purchase_date} max={maxFirstPurchaseDate} onChange={(first_purchase_date) => updateForm({ first_purchase_date })} />
              </div>
              {firstInvoiceOptions.length > 0 && (
                <div className="invoice-field">
                  <span>{tt("installmentModal.firstInstallmentMonth", "Fatura da 1ª parcela")}</span>
                  <div className="month-chip-row" role="listbox" aria-label={tt("installmentModal.firstInstallmentMonth", "Fatura da 1ª parcela")}>
                    {firstInvoiceOptions.map((option) => (
                      <button
                        key={option.dueDate}
                        className={`month-chip ${firstDueDate.slice(0, 7) === option.dueDate.slice(0, 7) ? "active" : ""}`}
                        type="button"
                        role="option"
                        aria-selected={firstDueDate.slice(0, 7) === option.dueDate.slice(0, 7)}
                        style={{ "--template-color": normalizeInvoiceColor(selectedCard?.color) }}
                        onClick={() => updateForm({ first_purchase_date: option.purchaseDate })}
                      >
                        <strong>{formatMonthShort(option.dueDate)}</strong>
                        <span>{formatDateShort(option.dueDate, language)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="duplicate-summary">{!firstInvoiceAllowed ? (language === "en-US" ? "The first installment can only join an invoice due within 12 months." : "A primeira parcela só pode entrar em uma fatura com vencimento em até 12 meses.") : (cycleHint || tt("installmentModal.selectCardDate", "Selecione o cartão e a data da primeira compra."))}</p>
            </div>
            <div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button><button className="btn btn-primary">{tt("installmentModal.next", "Próximo →")}</button></div>
          </>
        ) : (
          <>
            <div className="invoice-review">
              <div className="review-table">
                <div className="review-row installment-review-head"><span>#</span><span>{tt("installmentModal.installment", "Parcela")}</span><span>{tt("installmentModal.purchaseDate", "Data da compra")}</span><span>{tt("installmentModal.value", "Valor")}</span><span /></div>
                <div className="review-list">
                  {drafts.map((draft) => (
                      <div className="review-row installment-review-row" key={draft.id}>
                        <span>{draft.number}/{drafts.length}</span>
                        <strong>{formatMonthShort(draft.purchase_date)}</strong>
                        <div className="installment-destination">
                          <i aria-hidden="true" style={{ "--invoice-color": normalizeInvoiceColor(selectedCard?.color) }} />
                          <span>
                            <strong>{selectedCard?.name}</strong>
                            <small>{tt("installmentModal.createdAutomatically", "A fatura será definida pelo fechamento")} • {formatDateShort(draft.purchase_date)}</small>
                          </span>
                        </div>
                        <input inputMode="decimal" value={draft.amount} readOnly={!form.different_values} onChange={(event) => updateDraft(draft.id, { amount: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={() => updateDraft(draft.id, { amount: formatTypedMoneyAsCurrency(draft.amount, language) })} />
                        <button className="icon-btn small danger" type="button" onClick={() => removeDraft(draft.id)} aria-label="Remover parcela"><Trash2 size={15} /></button>
                      </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="review-footer">
              <p>
                {tt("installmentModal.totalConfirmed", "Valor total confirmado:")} <strong>{formatMoney(confirmedTotal)}</strong>
              </p>
              <div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>← Voltar</button><button className="btn btn-primary" disabled={!canCreate}>Confirmar {drafts.length} parcelas</button></div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}


