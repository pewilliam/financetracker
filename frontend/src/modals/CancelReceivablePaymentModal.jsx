import { Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function CancelReceivablePaymentModal({ data, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const payment = data.payment;
  const receivable = data.receivable;

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <div className="modal-card template-modal confirm-modal">
        <div className="modal-titlebar">
          <div className="modal-icon danger"><Trash2 size={22} /></div>
          <div>
            <p className="eyebrow">{receivable.person_name}</p>
            <h2>{tt("receivables.cancelPayment", "Cancelar pagamento")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="confirm-modal-body">
          <p>{tt("receivables.cancelPaymentMessage", "Deseja realmente cancelar este pagamento? O lançamento de ganho vinculado também será removido.")}</p>
          <div className="receivable-payment-context">
            <span>{formatDateShort(payment.paid_at, language)}</span>
            <strong>{formatMoney(payment.amount, language)}</strong>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary danger-action" type="button" onClick={onConfirm}><Trash2 size={16} /> {tt("receivables.confirmCancelPayment", "Cancelar pagamento")}</button>
        </div>
      </div>
    </div>
  );
}


