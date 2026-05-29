import { Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";

export default function DeleteReceivableModal({ receivable, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <div className="modal-card template-modal confirm-modal">
        <div className="modal-titlebar">
          <div className="modal-icon danger"><Trash2 size={22} /></div>
          <div>
            <p className="eyebrow">{receivable.person_name}</p>
            <h2>{tt("receivables.deleteReceivable", "Excluir recebível")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
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


