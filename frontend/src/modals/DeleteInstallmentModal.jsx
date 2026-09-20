import { createPortal } from "react-dom";
import { AlertTriangle, CreditCard, Loader2, Trash2, X } from "lucide-react";
import { formatMoney } from "../utils/format.js";

export default function DeleteInstallmentModal({ purchase, deleting = false, onClose, onConfirm }) {
  return createPortal(
    <div className="modal-layer installment-delete-layer">
      <button className="modal-backdrop" type="button" onClick={deleting ? undefined : onClose} aria-label="Cancelar exclusão" />
      <div className="modal-card template-modal confirm-modal installment-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-installment-title" aria-describedby="delete-installment-description">
        <header className="transaction-entry-titlebar installment-entry-titlebar compact installment-delete-titlebar">
          <span className="transaction-entry-icon danger"><Trash2 size={20} /></span>
          <div className="transaction-entry-heading">
            <p>COMPRA PARCELADA</p>
            <h2 id="delete-installment-title">Remover compra?</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={deleting} aria-label="Fechar modal"><X size={18} /></button>
        </header>

        <div className="confirm-modal-body installment-delete-body">
          <div className="installment-delete-warning"><AlertTriangle size={18} /><p id="delete-installment-description">Esta ação remove todas as parcelas das faturas e não pode ser desfeita. Lançamentos associados também podem ser afetados.</p></div>
          <div className="installment-delete-context">
            <span><CreditCard size={18} /></span>
            <div><small>{purchase.installment_count} parcelas</small><strong>{purchase.description}</strong></div>
            <strong>{formatMoney(purchase.total_amount)}</strong>
          </div>
        </div>

        <footer className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={deleting}>Cancelar</button>
          <button className="btn btn-primary danger-action" type="button" onClick={onConfirm} disabled={deleting}>{deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />} {deleting ? "Removendo..." : "Remover compra"}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
