import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { CalendarPlus, Check, CreditCard, Loader2, Trash2, X } from "lucide-react";
import DateField from "../components/DateField.jsx";
import FilterSelect from "../components/common/FilterSelect.jsx";
import InvoiceTemplateModal from "./InvoiceTemplateModal.jsx";
import WalletSelect from "../components/WalletSelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { CREATE_TEMPLATE_VALUE } from "../app/constants.js";
import { addMonthsToDate, formatMonthShort, nextDueDateFromDay, normalizeInvoiceColor } from "../app/helpers.js";

export default function InvoiceModal({ form, setForm, templates, wallets = [], onCreateTemplate, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const duplicateMonths = Math.min(23, Math.max(1, Number(form.duplicate_months) || 1));
  const totalCount = form.duplicate_next_month ? duplicateMonths + 1 : 1;
  const startLabel = form.due_date ? formatMonthShort(form.due_date) : "";
  const endLabel = form.due_date ? formatMonthShort(addMonthsToDate(form.due_date, totalCount - 1)) : "";
  const selectedTemplate = templates.find((template) => String(template.id) === String(form.template_id));
  const canAdvance = Boolean(form.template_id && form.due_date && form.wallet_id);
  const busy = submitting || templateModalOpen;
  const templateOptions = useMemo(() => [
    ...templates.map((template) => ({
      value: String(template.id),
      label: template.name,
      description: tt("invoiceModal.dueDayPerMonth", `Vence dia ${template.default_due_day}/mês`, { day: template.default_due_day }),
      color: normalizeInvoiceColor(template.color),
      searchText: `${template.name} ${template.default_due_day}`,
    })),
    {
      value: CREATE_TEMPLATE_VALUE,
      label: tt("invoiceModal.createNewModel", "+ Criar novo modelo"),
      color: "var(--muted)",
    },
  ], [language, templates]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || busy) return;
      if (document.querySelector(".invoice-template-modal-layer")) return;
      if (document.querySelector(".filter-select-menu, .category-multi-menu, .date-popover")) return;
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

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
      toast.success(tt("invoiceModal.modelCreated", "Modelo criado"));
    } catch {
      toast.error(tt("invoiceModal.modelSaveError", "Erro ao salvar modelo"));
    }
  };

  const buildDrafts = () => Array.from({ length: totalCount }, (_, index) => ({
    id: `${Date.now()}-${index}`,
    template_id: form.template_id,
    template_name: selectedTemplate?.name || "",
    template_color: normalizeInvoiceColor(selectedTemplate?.color),
    due_date: addMonthsToDate(form.due_date, index),
    wallet_id: form.wallet_id,
  }));

  const goToReview = (event) => {
    event.preventDefault();
    if (!canAdvance || submitting) return;
    setDrafts(buildDrafts());
    setStep(2);
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const removeDraft = (id) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const resetAutomaticDates = () => {
    const firstDate = drafts[0]?.due_date;
    if (!firstDate) return;
    setDrafts((current) => current.map((draft, index) => ({ ...draft, due_date: addMonthsToDate(firstDate, index) })));
  };

  const rowError = (draft) => {
    if (!draft.due_date) return tt("invoiceModal.invalidDate", "Informe uma data válida.");
    return "";
  };

  const validDrafts = drafts.filter((draft) => !rowError(draft));
  const canCreate = drafts.length > 0 && validDrafts.length === drafts.length;
  const reviewStartLabel = drafts[0]?.due_date ? formatMonthShort(drafts[0].due_date) : "";
  const reviewEndLabel = drafts[drafts.length - 1]?.due_date ? formatMonthShort(drafts[drafts.length - 1].due_date) : "";

  const submitDrafts = async (event) => {
    event.preventDefault();
    if (!canCreate || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(drafts);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-layer invoice-create-modal-layer">
      <button className="modal-backdrop" type="button" onClick={busy ? undefined : onClose} aria-label={tt("actions.close", "Fechar")} />
      <form
        className={`modal-card invoice-modal step-${step}`}
        onSubmit={step === 1 ? goToReview : submitDrafts}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-modal-title"
      >
        <header className="transaction-entry-titlebar compact">
          <span className="transaction-entry-icon"><CreditCard size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{tt("invoiceModal.invoiceRegistration", "CADASTRO DE FATURA")}</p>
            <h2 id="invoice-modal-title">{tt("invoiceModal.newInvoice", "Nova fatura")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={busy} aria-label={tt("actions.close", "Fechar modal")}>
            <X size={18} />
          </button>
        </header>

        <div className="invoice-stepper" aria-label={tt("invoiceModal.stepsLabel", "Etapas da criação de fatura")}>
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
                <FilterSelect
                  value={form.template_id}
                  options={templateOptions}
                  onChange={selectTemplate}
                  disabled={submitting}
                  searchable
                  searchPlaceholder={tt("invoiceModal.searchModel", "Buscar modelo...")}
                  emptyLabel={tt("invoiceModal.noModelFound", "Nenhum modelo encontrado.")}
                  ariaLabel={tt("invoiceModal.invoiceModel", "Modelo de fatura")}
                />
              </label>
              <label>
                <span>{tt("invoiceModal.firstDueDate", "Data de vencimento da primeira fatura")}</span>
                <DateField value={form.due_date} onChange={(value) => updateForm({ due_date: value })} />
              </label>
              <label>
                <span>{tt("invoiceModal.wallet", "Carteira da fatura")}</span>
                <WalletSelect
                  wallets={wallets.filter((wallet) => wallet.active)}
                  value={form.wallet_id}
                  onChange={(value) => updateForm({ wallet_id: value })}
                  ariaLabel={tt("invoiceModal.wallet", "Carteira da fatura")}
                />
              </label>

              <label className={`duplicate-option ${form.duplicate_next_month ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={form.duplicate_next_month}
                  onChange={(event) => updateForm({ duplicate_next_month: event.target.checked })}
                  disabled={submitting}
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
                      disabled={submitting}
                    />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="23"
                    value={duplicateMonths}
                    onChange={(event) => updateForm({ duplicate_months: Number(event.target.value) })}
                    disabled={submitting}
                  />
                  <div className="range-scale">
                    <span>{tt("invoiceModal.oneMonth", "1 mês")}</span>
                    <span>{tt("invoiceModal.months23", "23 meses")}</span>
                  </div>
                  <p className="duplicate-summary">
                    {form.due_date
                      ? tt("invoiceModal.totalInvoicesWithRange", `Serão criadas ${totalCount} faturas no total (${startLabel} até ${endLabel})`, { count: totalCount, start: startLabel, end: endLabel })
                      : tt("invoiceModal.totalInvoices", `Serão criadas ${totalCount} faturas no total`, { count: totalCount })}
                  </p>
                </div>
              )}
            </div>

            <footer className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>{tt("actions.cancel", "Cancelar")}</button>
              <button className="btn btn-primary" disabled={!canAdvance || submitting}>{tt("installmentModal.next", "Próximo →")}</button>
            </footer>
          </>
        ) : (
          <>
            <div className="invoice-review">
              <div className="review-toolbar">
                <button className="btn btn-ghost compact" type="button" onClick={resetAutomaticDates} disabled={submitting}>
                  {tt("invoiceModal.resetAutomaticDates", "Resetar datas automáticas")}
                </button>
              </div>

              <div className="review-table">
                <div className="review-row invoice-review-row review-head">
                  <span>#</span>
                  <span>{tt("invoiceModal.month", "Mês")}</span>
                  <span>{tt("invoiceModal.dueDate", "Data de venc.")}</span>
                  <span>{tt("invoiceModal.model", "Modelo")}</span>
                  <span />
                </div>
                <div className="review-list">
                  {drafts.map((draft, index) => {
                    const error = rowError(draft);
                    return (
                      <div className={`review-row invoice-review-row ${error ? "has-error" : ""}`} key={draft.id} title={error}>
                        <span>{index + 1}</span>
                        <strong>{draft.due_date ? formatMonthShort(draft.due_date) : "-"}</strong>
                        <DateField className="compact" value={draft.due_date} onChange={(value) => updateDraft(draft.id, { due_date: value })} />
                        <span className="review-template-name"><i style={{ "--invoice-color": draft.template_color }} />{draft.template_name}</span>
                        <button
                          className="icon-btn small danger"
                          type="button"
                          onClick={() => removeDraft(draft.id)}
                          disabled={submitting || drafts.length === 1}
                          aria-label={tt("invoiceModal.removeInvoice", "Remover fatura")}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="review-footer">
              <p>
                {reviewStartLabel && reviewEndLabel
                  ? tt(
                    "invoiceModal.reviewSummary",
                    `${drafts.length} ${drafts.length === 1 ? "fatura" : "faturas"} · ${reviewStartLabel} até ${reviewEndLabel}`,
                    {
                      count: drafts.length,
                      label: drafts.length === 1 ? t("invoiceModal.invoice") : t("invoiceModal.invoices"),
                      start: reviewStartLabel,
                      end: reviewEndLabel,
                    },
                  )
                  : tt(
                    "invoiceModal.reviewSummaryCount",
                    `${drafts.length} ${drafts.length === 1 ? "fatura" : "faturas"}`,
                    { count: drafts.length, label: drafts.length === 1 ? t("invoiceModal.invoice") : t("invoiceModal.invoices") },
                  )}
              </p>
              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setStep(1)} disabled={submitting}>
                  {tt("invoiceModal.back", "← Voltar")}
                </button>
                <button className="btn btn-primary" disabled={!canCreate || submitting}>
                  {submitting
                    ? <><Loader2 className="spin" size={16} /> {tt("invoiceModal.creating", "Criando...")}</>
                    : tt("invoiceModal.createInvoices", `Criar ${drafts.length} ${drafts.length === 1 ? "fatura" : "faturas"}`, { count: drafts.length, label: drafts.length === 1 ? t("invoiceModal.invoice") : t("invoiceModal.invoices") })}
                </button>
              </div>
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
    </div>,
    document.body,
  );
}
