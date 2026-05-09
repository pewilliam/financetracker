import { CreditCard, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function InstallmentDetailsModal({ purchase, onClose, onDelete }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <div className="modal-card invoice-modal installment-modal step-2">
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div><p className="eyebrow">{purchase.progress_label}</p><h2>{purchase.description}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-review">
          <div className="review-table">
            <div className="review-row installment-review-head"><span>#</span><span>{tt("installmentModal.installment", "Parcela")}</span><span>{tt("installmentModal.invoice", "Fatura")}</span><span>{tt("installmentModal.status", "Status")}</span><span /></div>
            <div className="review-list">
              {purchase.items.map((item) => (
                <div className="review-row installment-review-row" key={item.id}>
                  <span>{item.installment_number}/{purchase.installment_count}</span>
                  <strong>{formatMoney(item.amount)}</strong>
                  <span>{item.invoice ? `${item.invoice.name} — ${formatDateShort(item.invoice.due_date)}` : "Fatura removida — realocar"}</span>
                  <span className={`due-badge compact ${item.invoice?.paid ? "paid" : item.invoice ? "" : "danger"}`}>{item.invoice?.paid ? tt("installmentModal.paid", "Paga") : item.invoice ? tt("installmentModal.pending", "Pendente") : tt("installmentModal.orphan", "Órfã")}</span>
                  <span />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions details-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("installmentModal.close", "Fechar")}</button>
          <button className="btn btn-ghost danger-text" type="button" onClick={() => onDelete(purchase.id)}><Trash2 size={16} /> {tt("installmentModal.removePurchase", "Remover compra")}</button>
        </div>
      </div>
    </div>
  );
}


