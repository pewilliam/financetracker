import { Power, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/index.ts";
import { normalizeInvoiceColor } from "../app/helpers.js";

export default function InvoiceTemplateActionModal({ template, action, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [submitting, setSubmitting] = useState(false);
  const deleting = action === "delete";
  const invoiceCount = template.total_invoices || 0;

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(template);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={tt("actions.cancel", "Cancelar")} />
      <div className="modal-card template-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-template-action-title">
        <div className="modal-titlebar">
          <div className={`modal-icon ${deleting ? "danger" : "warning"}`}>
            {deleting ? <Trash2 size={22} /> : <Power size={22} />}
          </div>
          <div>
            <p className="eyebrow">{tt("invoiceModels.invoiceModel", "Modelo de fatura")}</p>
            <h2 id="invoice-template-action-title">
              {deleting ? tt("invoiceModels.deleteModel", "Excluir modelo") : tt("invoiceModels.disableModel", "Desativar modelo")}
            </h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={tt("actions.close", "Fechar modal")}><X size={18} /></button>
        </div>

        <div className="confirm-modal-body">
          <p>
            {deleting
              ? invoiceCount > 0
                ? tt("invoiceModels.deleteEmptyInvoicesMessage", `O modelo e ${invoiceCount} ${invoiceCount === 1 ? "fatura vazia vinculada" : "faturas vazias vinculadas"} serão excluídos definitivamente.`, { count: invoiceCount, invoices: invoiceCount === 1 ? "empty linked invoice" : "empty linked invoices" })
                : tt("invoiceModels.deleteModelMessage", "O modelo será excluído definitivamente. Esta ação não pode ser desfeita.")
              : tt("invoiceModels.disableModelMessage", "As faturas já criadas serão preservadas. O modelo deixará de aparecer na criação de novas faturas.")}
          </p>
          <div className="invoice-template-action-context">
            <i style={{ "--invoice-color": normalizeInvoiceColor(template.color) }} />
            <strong>{template.name}</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>{tt("actions.cancel", "Cancelar")}</button>
          <button className={`btn btn-primary ${deleting ? "danger-action" : "warning-action"}`} type="button" onClick={confirm} disabled={submitting}>
            {deleting ? <Trash2 size={16} /> : <Power size={16} />}
            {submitting
              ? tt("actions.saving", "Salvando...")
              : deleting ? tt("invoiceModels.delete", "Excluir") : tt("invoiceModels.disable", "Desativar")}
          </button>
        </div>
      </div>
    </div>
  );
}
