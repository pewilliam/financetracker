import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Trash2, X } from "lucide-react";
import InvoiceSelector from "../components/InvoiceSelector.jsx";
import { useI18n } from "../i18n/index.ts";
import { addMonthsToDate, formatMonthShort, formatMonthSlash, invoiceAcceptsNewCharges, normalizeInvoiceColor } from "../app/helpers.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InstallmentModal({ form, setForm, invoices, allowOverdueInvoiceEdits = false, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const selectableInvoices = useMemo(
    () => invoices.filter((invoice) => invoiceAcceptsNewCharges(invoice, allowOverdueInvoiceEdits)),
    [invoices, allowOverdueInvoiceEdits]
  );
  const invoicesById = useMemo(() => new Map(selectableInvoices.map((invoice) => [String(invoice.id), invoice])), [selectableInvoices]);
  const updateForm = (patch) => setForm({ ...form, ...patch });
  const count = Math.min(48, Math.max(1, Number(form.installment_count) || 1));
  const total = parseTypedMoneyInput(form.total_amount, language);
  const totalCents = Math.round(total * 100);
  const baseInstallmentCents = count ? Math.floor(totalCents / count) : 0;
  const lastInstallmentCents = count ? totalCents - (baseInstallmentCents * (count - 1)) : 0;
  const hasRoundingAdjustment = count > 1 && totalCents % count !== 0;
  const installmentAmount = baseInstallmentCents / 100;
  const adjustedLastInstallmentAmount = lastInstallmentCents / 100;
  const firstInvoice = selectableInvoices.find((invoice) => String(invoice.id) === String(form.first_invoice_id));
  const endDate = firstInvoice ? addMonthsToDate(firstInvoice.due_date, count - 1) : "";

  useEffect(() => {
    if (form.first_invoice_id && !firstInvoice) updateForm({ first_invoice_id: "" });
  }, [firstInvoice, form.first_invoice_id]);

  const matchingInvoice = (dateString) => selectableInvoices.find((invoice) => (
    invoice.template_id === firstInvoice?.template_id &&
    invoice.due_date.slice(0, 7) === dateString.slice(0, 7)
  ));

  const handleMoneyChange = (value) => updateForm({ total_amount: formatTypedMoneyForEditing(value, language) });
  const normalizeMoneyField = (field) => updateForm({ [field]: formatTypedMoneyAsCurrency(form[field], language) });

  const buildDrafts = () => Array.from({ length: count }, (_, index) => {
    const dueDate = addMonthsToDate(firstInvoice.due_date, index);
    const matched = matchingInvoice(dueDate);
    const amount = index === count - 1 ? adjustedLastInstallmentAmount : installmentAmount;
    return {
      id: `${Date.now()}-${index}`,
      number: index + 1,
      month: dueDate,
      invoice_id: matched?.id || "",
      amount: formatMoney(amount)
    };
  });

  const goToReview = (event) => {
    event.preventDefault();
    if (!form.description || !total || !firstInvoice) return;
    setDrafts(buildDrafts());
    setStep(2);
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const destinationForDraft = (draft) => {
    const invoice = draft.invoice_id ? invoicesById.get(String(draft.invoice_id)) : null;
    return {
      automatic: !invoice,
      color: normalizeInvoiceColor(invoice?.color || firstInvoice?.color),
      dueDate: invoice?.due_date || draft.month,
      name: invoice?.name || firstInvoice?.name || "Fatura automática"
    };
  };

  const removeDraft = (id) => setDrafts((current) => current.filter((draft) => draft.id !== id));
  const confirmedTotal = drafts.reduce((sum, draft) => sum + parseTypedMoneyInput(draft.amount, language), 0);
  const invoiceCount = new Set(drafts.map((draft) => draft.invoice_id || `auto-${draft.month}`)).size;
  const canCreate = drafts.length && drafts.every((draft) => parseTypedMoneyInput(draft.amount, language) > 0);

  const submitDrafts = (event) => {
    event.preventDefault();
    if (!canCreate) return;
    onSubmit({
      description: form.description,
      total_amount: confirmedTotal,
      installment_count: drafts.length,
      first_invoice_id: Number(form.first_invoice_id),
      items: drafts.map((draft) => ({
        invoice_id: draft.invoice_id ? Number(draft.invoice_id) : null,
        amount: parseTypedMoneyInput(draft.amount, language),
        target_due_date: draft.month
      }))
    });
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className={`modal-card invoice-modal installment-modal step-${step}`} onSubmit={step === 1 ? goToReview : submitDrafts}>
        <div className="modal-titlebar installment-modal-titlebar">
          <h2>{tt("installmentModal.addInstallmentPurchase", "Adicionar compra parcelada")}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-stepper">
          <div className={`stepper-item ${step > 1 ? "done" : "active"}`}><span>{step > 1 ? <Check size={15} /> : "1"}</span><strong>{tt("installmentModal.configure", "Configurar")}</strong></div>
          <i />
          <div className={`stepper-item ${step === 2 ? "active" : ""}`}><span>2</span><strong>{tt("installmentModal.reviewInstallments", "Revisar parcelas")}</strong></div>
        </div>
        {step === 1 ? (
          <>
            <div className="invoice-modal-body">
              <label><span>{tt("installmentModal.purchaseDescription", "Descrição da compra")}</span><input placeholder={tt("installmentModal.purchaseDescriptionPlaceholder", "Ex: PlayStation 5, iPhone, Notebook...")} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} required /></label>
              <div className="installment-form-row">
                <label><span>{tt("installmentModal.totalPurchaseAmount", "Valor total da compra")}</span><input inputMode="decimal" placeholder="R$ 0,00" value={form.total_amount} onChange={(event) => handleMoneyChange(event.target.value)} onBlur={() => normalizeMoneyField("total_amount")} required /></label>
                <label><span>{tt("installmentModal.numberOfInstallments", "Número de parcelas")}</span><input type="number" min="1" max="48" value={form.installment_count ?? ""} onChange={(event) => updateForm({ installment_count: event.target.value })} onBlur={() => updateForm({ installment_count: count })} required /></label>
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
              <InvoiceSelector
                invoices={selectableInvoices}
                value={firstInvoice ? { templateId: String(firstInvoice.template_id ?? firstInvoice.id), invoiceId: String(firstInvoice.id) } : null}
                onChange={(selection) => updateForm({ first_invoice_id: selection?.invoiceId || "" })}
              />
              <p className="duplicate-summary">{firstInvoice ? tt("installmentModal.installmentsFromTo", `Parcelas distribuídas de ${formatMonthSlash(firstInvoice.due_date)} até ${formatMonthSlash(endDate)}`, { start: formatMonthSlash(firstInvoice.due_date), end: formatMonthSlash(endDate) }) : tt("installmentModal.selectFirstInvoiceDistribution", "Selecione a fatura inicial para ver a distribuição.")}</p>
            </div>
            <div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button><button className="btn btn-primary">{tt("installmentModal.next", "Próximo →")}</button></div>
          </>
        ) : (
          <>
            <div className="invoice-review">
              <div className="review-table">
                <div className="review-row installment-review-head"><span>#</span><span>{tt("installmentModal.installment", "Parcela")}</span><span>{tt("installmentModal.destinationInvoice", "Fatura destino")}</span><span>{tt("installmentModal.value", "Valor")}</span><span /></div>
                <div className="review-list">
                  {drafts.map((draft, index) => {
                    const destination = destinationForDraft(draft);
                    return (
                      <div className="review-row installment-review-row" key={draft.id}>
                        <span>{draft.number}/{count}</span>
                        <strong>{formatMonthShort(draft.month)}</strong>
                        <div className="installment-destination">
                          <i aria-hidden="true" style={{ "--invoice-color": destination.color }} />
                          <span>
                            <strong>{destination.name}</strong>
                            <small>{destination.automatic ? tt("installmentModal.createdAutomatically", "Será criada automaticamente") : tt("installmentModal.existingInvoice", "Fatura existente")} • {tt("installments.due", "vence")} {formatDateShort(destination.dueDate)}</small>
                          </span>
                        </div>
                        <input inputMode="decimal" value={draft.amount} readOnly={!form.different_values} onChange={(event) => updateDraft(draft.id, { amount: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={() => updateDraft(draft.id, { amount: formatTypedMoneyAsCurrency(draft.amount, language) })} />
                        <button className="icon-btn small danger" type="button" onClick={() => removeDraft(draft.id)} aria-label="Remover parcela"><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="review-footer">
              <div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>← Voltar</button><button className="btn btn-primary" disabled={!canCreate}>Confirmar {drafts.length} parcelas</button></div>
              <p>
                {tt("installmentModal.totalConfirmed", "Valor total confirmado:")} <strong>{formatMoney(confirmedTotal)}</strong>
                {invoiceCount > 1 ? ` • ${tt("installmentModal.installmentsDifferentInvoices", `Parcelas em ${invoiceCount} faturas diferentes`, { count: invoiceCount })}` : ""}
              </p>
            </div>
          </>
        )}
      </form>
    </div>
  );
}


