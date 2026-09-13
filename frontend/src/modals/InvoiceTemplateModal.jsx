import { useState } from "react";
import { CreditCard, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { defaultTemplateForm, normalizeInvoiceColor } from "../app/helpers.js";
import ColorPickerField from "../components/ColorPickerField.jsx";

export default function InvoiceTemplateModal({ initial, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [form, setForm] = useState(initial ? {
    name: initial.name,
    color: normalizeInvoiceColor(initial.color),
    default_due_day: initial.default_due_day
  } : defaultTemplateForm());
  const dueDay = Math.min(31, Math.max(1, Number(form.default_due_day) || 1));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      color: normalizeInvoiceColor(form.color),
      default_due_day: dueDay
    });
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="modal-card template-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div><p className="eyebrow">{tt("invoiceModels.invoiceModel", "Modelo de fatura")}</p><h2>{initial ? tt("invoiceModels.editModel", "Editar modelo") : tt("invoiceModels.newModel", "Novo modelo")}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-modal-body">
          <label><span>{tt("invoiceModels.name", "Nome")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <div className="shared-color-field">
            <span>{tt("invoiceModels.color", "Cor")}</span>
            <ColorPickerField value={form.color} onChange={(color) => setForm({ ...form, color })} label={tt("invoiceModels.customColor", "Cor personalizada")} ariaLabel={tt("invoiceModels.chooseColor", "Escolher a cor do modelo")} />
          </div>
          <label><span>{tt("invoiceModels.defaultDueDay", "Dia de vencimento padrão")}</span><input type="number" min="1" max="31" value={form.default_due_day ?? ""} onChange={(event) => setForm({ ...form, default_due_day: event.target.value })} onBlur={() => setForm({ ...form, default_due_day: dueDay })} required /></label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary">{tt("actions.save", "Salvar")}</button>
        </div>
      </form>
    </div>
  );
}


