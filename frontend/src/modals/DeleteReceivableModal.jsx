import { Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";

export default function DeleteReceivableModal({ receivable, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;

  return (
    <div className="modal-layer receivable-action-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <div className="modal-card invoice-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-receivable-title">
        <header className="transaction-entry-titlebar compact">
          <span className="transaction-entry-icon danger"><Trash2 size={20} /></span>
          <div className="transaction-entry-heading">
            <p>{receivable.person_name}</p>
            <h2 id="delete-receivable-title">{tt("receivables.deleteReceivable", "Excluir recebível")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}>
            <X size={18} />
          </button>
        </header>
        <div className="confirm-modal-body">
          <p>{tt("receivables.deleteReceivableMessage", "Deseja realmente excluir este recebível? Esta ação não pode ser desfeita.")}</p>
          <div className="receivable-payment-context">
            <span>{receivable.description}</span>
            <strong>{formatMoney(receivable.total_amount, language)}</strong>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary danger-action" type="button" onClick={onConfirm}><Trash2 size={16} /> {tt("actions.delete", "Excluir")}</button>
        </div>
      </div>
    </div>
  );
}
