import { useState } from "react";
import { toast } from "react-hot-toast";
import { CalendarPlus, Check, CreditCard, Trash2, X } from "lucide-react";
import DateField from "../components/DateField.jsx";
import InvoiceTemplateModal from "./InvoiceTemplateModal.jsx";
import { useI18n } from "../i18n/index.ts";
import { CREATE_TEMPLATE_VALUE } from "../app/constants.js";
import { addMonthsToDate, formatMonthShort, nextDueDateFromDay, normalizeInvoiceColor } from "../app/helpers.js";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function InvoiceModal({ form, setForm, templates, onCreateTemplate, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const duplicateMonths = Math.min(23, Math.max(1, Number(form.duplicate_months) || 1));
  const totalCount = form.duplicate_next_month ? duplicateMonths + 1 : 1;
  const startLabel = form.due_date ? formatMonthShort(form.due_date) : "";
  const endLabel = form.due_date ? formatMonthShort(addMonthsToDate(form.due_date, totalCount - 1)) : "";
  const selectedTemplate = templates.find((template) => String(template.id) === String(form.template_id));

  const updateForm = (patch) => setForm({ ...form, ...patch });

  const selectTemplate = (value) => {
    if (value === CREATE_TEMPLATE_VALUE) {
      setTemplateModalOpen(true);
      return;
    }
    const template = templates.find((item) => String(item.id) === String(value));
    updateForm({
      template_id: value,
      due_date: template ? nextDueDateFromDay(template.default_due_day) : form.due_date
    });
  };

  const createTemplateInline = async (payload) => {
    try {
      const template = await onCreateTemplate(payload);
      setForm({
        ...form,
        template_id: String(template.id),
        due_date: nextDueDateFromDay(template.default_due_day)
      });
      setTemplateModalOpen(false);
      toast.success("Modelo criado");
    } catch {
      toast.error("Erro ao salvar modelo");
    }
  };

  const buildDrafts = () => Array.from({ length: totalCount }, (_, index) => ({
    id: `${Date.now()}-${index}`,
    template_id: form.template_id,
    template_name: selectedTemplate?.name || "",
    template_color: normalizeInvoiceColor(selectedTemplate?.color),
    due_date: addMonthsToDate(form.due_date, index),
    initial_amount: form.initial_amount
  }));

  const goToReview = (event) => {
    event.preventDefault();
    if (!form.template_id || !form.due_date || !parseTypedMoneyInput(form.initial_amount, language)) return;
    setDrafts(buildDrafts());
    setStep(2);
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const removeDraft = (id) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const matchFirstValue = () => {
    const first = drafts[0]?.initial_amount || "";
    setDrafts((current) => current.map((draft) => ({ ...draft, initial_amount: first })));
  };

  const resetAutomaticDates = () => {
    const firstDate = drafts[0]?.due_date;
    if (!firstDate) return;
    setDrafts((current) => current.map((draft, index) => ({ ...draft, due_date: addMonthsToDate(firstDate, index) })));
  };

  const rowError = (draft) => {
    if (!draft.due_date) return "Informe uma data válida.";
    if (!parseTypedMoneyInput(draft.initial_amount, language)) return "Informe um valor maior que zero.";
    return "";
  };

  const validDrafts = drafts.filter((draft) => !rowError(draft));
  const canCreate = drafts.length > 0 && validDrafts.length === drafts.length;
  const totalCommitted = drafts.reduce((sum, draft) => sum + parseTypedMoneyInput(draft.initial_amount, language), 0);

  const submitDrafts = (event) => {
    event.preventDefault();
    if (!canCreate) return;
    onSubmit(drafts);
  };

  const handleMoneyChange = (value, setter) => {
    setter(formatTypedMoneyForEditing(value, language));
  };
  const normalizeMoneyValue = (value) => formatTypedMoneyAsCurrency(value, language);

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className={`modal-card invoice-modal step-${step}`} onSubmit={step === 1 ? goToReview : submitDrafts}>
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div>
            <p className="eyebrow">{tt("invoiceModal.invoiceRegistration", "Cadastro de fatura")}</p>
            <h2>{tt("invoiceModal.newInvoice", "Nova fatura")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>

        <div className="invoice-stepper" aria-label="Etapas da criação de fatura">
          <div className={`stepper-item ${step > 1 ? "done" : "active"}`}>
            <span>{step > 1 ? <Check size={15} /> : "1"}</span>
            <strong>{tt("invoiceModal.configure", "Configurar")}</strong>
          </div>
          <i />
          <div className={`stepper-item ${step === 2 ? "active" : ""}`}>
            <span>2</span>
            <strong>{tt("invoiceModal.reviewAndAdjust", "Revisar e ajustar")}</strong>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="invoice-modal-body">
              <label>
                <span>{tt("invoiceModal.invoiceModel", "Modelo de fatura")}</span>
                <div className="template-select-shell">
                  {selectedTemplate && <span className="template-dot" style={{ "--invoice-color": normalizeInvoiceColor(selectedTemplate.color) }} />}
                  <select value={form.template_id} onChange={(event) => selectTemplate(event.target.value)} required>
                    <option value="">{tt("invoiceModal.selectModel", "Selecione um modelo")}</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>● {template.name} — {template.default_due_day}/mês</option>
                    ))}
                    <option value={CREATE_TEMPLATE_VALUE}>{tt("invoiceModal.createNewModel", "+ Criar novo modelo")}</option>
                  </select>
                </div>
              </label>
              <label><span>{tt("invoiceModal.firstDueDate", "Data de vencimento da primeira fatura")}</span><DateField value={form.due_date} onChange={(value) => updateForm({ due_date: value })} /></label>
              <label><span>{tt("invoiceModal.initialAmount", "Valor inicial")}</span><input inputMode="decimal" placeholder="R$ 0,00" value={form.initial_amount} onChange={(event) => handleMoneyChange(event.target.value, (value) => updateForm({ initial_amount: value }))} onBlur={() => updateForm({ initial_amount: normalizeMoneyValue(form.initial_amount) })} /></label>

              <label className={`duplicate-option ${form.duplicate_next_month ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={form.duplicate_next_month}
                  onChange={(event) => updateForm({ duplicate_next_month: event.target.checked })}
                />
                <span className="duplicate-icon"><CalendarPlus size={20} /></span>
                <span>
                  <strong>{tt("invoiceModal.duplicateNextMonths", "Duplicar para os próximos meses")}</strong>
                  <small>{tt("invoiceModal.duplicateDescription", "Gere faturas futuras e revise cada mês antes de confirmar.")}</small>
                </span>
              </label>

              {form.duplicate_next_month && (
                <div className="duplicate-range">
                  <div className="range-head">
                    <span>{tt("invoiceModal.additionalMonths", "Quantidade de meses adicionais")}</span>
                    <input
                      type="number"
                      min="1"
                      max="23"
                      value={form.duplicate_months ?? ""}
                      onChange={(event) => updateForm({ duplicate_months: event.target.value })}
                      onBlur={() => updateForm({ duplicate_months: duplicateMonths })}
                    />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="23"
                    value={duplicateMonths}
                    onChange={(event) => updateForm({ duplicate_months: Number(event.target.value) })}
                  />
                  <div className="range-scale"><span>{tt("invoiceModal.oneMonth", "1 mês")}</span><span>{tt("invoiceModal.months23", "23 meses")}</span></div>
                  <p className="duplicate-summary">
                    {form.due_date
                      ? tt("invoiceModal.totalInvoicesWithRange", `Serão criadas ${totalCount} faturas no total (${startLabel} até ${endLabel})`, { count: totalCount, start: startLabel, end: endLabel })
                      : tt("invoiceModal.totalInvoices", `Serão criadas ${totalCount} faturas no total`, { count: totalCount })}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
              <button className="btn btn-primary">{tt("installmentModal.next", "Próximo →")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="invoice-review">
              <div className="review-toolbar">
                <button className="btn btn-ghost compact" type="button" onClick={matchFirstValue}>Igualar todos os valores ao primeiro</button>
                <button className="btn btn-ghost compact" type="button" onClick={resetAutomaticDates}>Resetar datas automáticas</button>
              </div>

              <div className="review-table">
                <div className="review-row review-head">
                  <span>#</span>
                  <span>{tt("invoiceModal.month", "Mês")}</span>
                  <span>{tt("invoiceModal.dueDate", "Data de venc.")}</span>
                  <span>{tt("invoiceModal.amount", "Valor")}</span>
                  <span>{tt("invoiceModal.model", "Modelo")}</span>
                  <span />
                </div>
                <div className="review-list">
                  {drafts.map((draft, index) => {
                    const error = rowError(draft);
                    return (
                      <div className={`review-row ${error ? "has-error" : ""}`} key={draft.id} title={error}>
                        <span>{index + 1}</span>
                        <strong>{draft.due_date ? formatMonthShort(draft.due_date) : "-"}</strong>
                        <DateField className="compact" value={draft.due_date} onChange={(value) => updateDraft(draft.id, { due_date: value })} />
                        <input inputMode="decimal" value={draft.initial_amount} onChange={(event) => handleMoneyChange(event.target.value, (value) => updateDraft(draft.id, { initial_amount: value }))} onBlur={() => updateDraft(draft.id, { initial_amount: normalizeMoneyValue(draft.initial_amount) })} />
                        <span className="review-template-name"><i style={{ "--invoice-color": draft.template_color }} />{draft.template_name}</span>
                        <button className="icon-btn small danger" type="button" onClick={() => removeDraft(draft.id)} aria-label="Remover fatura"><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="review-footer">
              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>← Voltar</button>
                <button className="btn btn-primary" disabled={!canCreate}>
                  {tt("invoiceModal.createInvoices", `Criar ${drafts.length} ${drafts.length === 1 ? "fatura" : "faturas"}`, { count: drafts.length, label: drafts.length === 1 ? t("invoiceModal.invoice") : t("invoiceModal.invoices") })}
                </button>
              </div>
              <p>Total comprometido: <strong>{formatMoney(totalCommitted)}</strong></p>
            </div>
          </>
        )}
      </form>
      {templateModalOpen && (
        <InvoiceTemplateModal
          onClose={() => setTemplateModalOpen(false)}
          onSubmit={createTemplateInline}
        />
      )}
    </div>
  );
}


