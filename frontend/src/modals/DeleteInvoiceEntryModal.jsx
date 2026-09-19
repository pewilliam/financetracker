import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CreditCard, Loader2, Receipt, Trash2, X } from "lucide-react";

import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";

export default function DeleteInvoiceEntryModal({ entry, onConfirm, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const [deleting, setDeleting] = useState(false);
  const installment = entry.context === "installment";
  const refund = !installment && entry.amount < 0;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !deleting) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [deleting, onClose]);

  const confirm = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onConfirm();
    } catch {
      // A página exibe o erro; o modal segue aberto para uma nova tentativa.
      setDeleting(false);
    }
  };

  const title = installment
    ? copy("Remover parcela?", "Remove installment?")
    : refund
      ? copy("Remover reembolso?", "Remove refund?")
      : copy("Remover item?", "Remove item?");

  return createPortal(
    <div className="modal-layer invoice-entry-delete-layer">
      <button className="modal-backdrop" type="button" onClick={deleting ? undefined : onClose} aria-label={copy("Cancelar exclusão", "Cancel deletion")} />
      <div className="modal-card template-modal confirm-modal invoice-entry-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-invoice-entry-title" aria-describedby="delete-invoice-entry-description">
        <header className="transaction-entry-titlebar invoice-entry-titlebar compact">
          <span className="transaction-entry-icon danger"><Trash2 size={20} /></span>
          <div className="transaction-entry-heading">
            <p>{copy("ITEM DA FATURA", "INVOICE ITEM")}</p>
            <h2 id="delete-invoice-entry-title">{title}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={deleting} aria-label={copy("Fechar", "Close")}><X size={18} /></button>
        </header>

        <div className="confirm-modal-body invoice-entry-delete-body">
          <div className="installment-delete-warning">
            <AlertTriangle size={18} />
            <p id="delete-invoice-entry-description">
              {installment
                ? copy(
                  "A parcela sai desta fatura e volta a ficar pendente na compra parcelada. Esta ação não pode ser desfeita.",
                  "The installment leaves this invoice and goes back to pending on the purchase. This action cannot be undone.",
                )
                : copy(
                  "O item será removido da fatura e o total será recalculado. Esta ação não pode ser desfeita.",
                  "The item will be removed from the invoice and the total recalculated. This action cannot be undone.",
                )}
            </p>
          </div>
          <div className="invoice-entry-delete-context">
            <span>{installment ? <CreditCard size={18} /> : <Receipt size={18} />}</span>
            <div>
              <small>
                {installment
                  ? copy(`Parcela ${entry.item.installment_number}/${entry.item.installment_count}`, `Installment ${entry.item.installment_number}/${entry.item.installment_count}`)
                  : refund ? copy("Reembolso", "Refund") : copy("Gasto", "Expense")}
              </small>
              <strong>{entry.description}</strong>
            </div>
            <strong>{formatMoney(entry.amount)}</strong>
          </div>
        </div>

        <footer className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={deleting}>{copy("Cancelar", "Cancel")}</button>
          <button className="btn btn-primary danger-action" type="button" onClick={confirm} disabled={deleting}>
            {deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            {deleting ? copy("Removendo...", "Removing...") : copy("Remover", "Remove")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
