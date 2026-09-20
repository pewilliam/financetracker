import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CreditCard, Loader2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { defaultTemplateForm, isMobileViewport, normalizeInvoiceColor } from "../app/helpers.js";
import ColorPickerField from "../components/ColorPickerField.jsx";
import useModalLifecycle from "../hooks/useModalLifecycle.js";

export default function InvoiceTemplateModal({ initial, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [form, setForm] = useState(initial ? {
    name: initial.name,
    color: normalizeInvoiceColor(initial.color),
    default_due_day: initial.default_due_day
  } : defaultTemplateForm());
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef(null);
  const dueDay = Math.min(31, Math.max(1, Number(form.default_due_day) || 1));
  useModalLifecycle({ onClose, busy: submitting, initialFocusRef: nameInputRef, autoFocus: !isMobileViewport() });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        color: normalizeInvoiceColor(form.color),
        default_due_day: dueDay
      });
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-layer invoice-template-modal-layer">
      <button className="modal-backdrop" type="button" onClick={submitting ? undefined : onClose} aria-label={tt("actions.cancel", "Cancelar")} />
      <form className="modal-card wallet-modal wallet-editor-modal invoice-template-editor-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="invoice-template-modal-title">
        <div className="wallet-transfer-header">
          <i><CreditCard size={20} /></i>
          <div>
            <small>{tt("invoiceModels.editorEyebrow", "ORGANIZAÇÃO DAS FATURAS")}</small>
            <h2 id="invoice-template-modal-title">{initial ? tt("invoiceModels.editModel", "Editar modelo") : tt("invoiceModels.newModel", "Novo modelo")}</h2>
            <p>{initial ? tt("invoiceModels.editModelHint", "Atualize a identificação e o vencimento padrão.") : tt("invoiceModels.newModelHint", "Crie um padrão para organizar suas próximas faturas.")}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={submitting} aria-label={tt("actions.close", "Fechar modal")}><X size={18} /></button>
        </div>
        <div className="wallet-modal-body form-stack invoice-template-editor-body">
          <div className="field-label"><span>{tt("invoiceModels.name", "Nome")}</span><input ref={nameInputRef} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={tt("invoiceModels.namePlaceholder", "Ex: Nubank, Cartão principal...")} disabled={submitting} required /></div>
          <div className="shared-color-field">
            <span>{tt("invoiceModels.color", "Cor")}</span>
            <ColorPickerField value={form.color} onChange={(color) => setForm({ ...form, color })} label={tt("invoiceModels.customColor", "Cor personalizada")} ariaLabel={tt("invoiceModels.chooseColor", "Escolher a cor do modelo")} disabled={submitting} />
          </div>
          <div className="field-label"><span>{tt("invoiceModels.defaultDueDay", "Dia de vencimento padrão")}</span><input type="number" min="1" max="31" value={form.default_due_day ?? ""} onChange={(event) => setForm({ ...form, default_due_day: event.target.value })} onBlur={() => setForm({ ...form, default_due_day: dueDay })} disabled={submitting} required /><small>{tt("invoiceModels.defaultDueDayHint", "Usaremos este dia ao sugerir o vencimento de novas faturas.")}</small></div>
        </div>
        <footer className="wallet-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary" type="submit" disabled={submitting || !form.name.trim()}>{submitting ? <><Loader2 className="spin" size={16} /> {tt("actions.saving", "Salvando...")}</> : tt("actions.save", "Salvar")}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}


