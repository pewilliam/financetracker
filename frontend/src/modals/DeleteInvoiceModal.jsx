import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarDays, Loader2, Trash2, X } from "lucide-react";

import { useI18n } from "../i18n/index.ts";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { formatDateWithWeekday } from "../utils/format.js";

export default function DeleteInvoiceModal({ invoice, onConfirm, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const [deleting, setDeleting] = useState(false);
  useModalLifecycle({ onClose, busy: deleting });

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

  return createPortal(
    <div className="modal-layer invoice-delete-layer">
      <button className="modal-backdrop" type="button" onClick={deleting ? undefined : onClose} aria-label={copy("Cancelar exclusão", "Cancel deletion")} />
      <div className="modal-card template-modal confirm-modal invoice-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-invoice-title" aria-describedby="delete-invoice-description">
        <header className="transaction-entry-titlebar invoice-entry-titlebar compact">
          <span className="transaction-entry-icon danger"><Trash2 size={20} /></span>
          <div className="transaction-entry-heading">
            <p>{copy("FATURA", "INVOICE")}</p>
            <h2 id="delete-invoice-title">{copy("Excluir fatura?", "Delete invoice?")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={deleting} aria-label={copy("Fechar", "Close")}><X size={18} /></button>
        </header>

        <div className="confirm-modal-body invoice-delete-body">
          <div className="installment-delete-warning">
            <AlertTriangle size={18} />
            <p id="delete-invoice-description">
              {copy(
                "Esta fatura não possui itens e será removida junto com o lançamento gerado automaticamente. A ação não pode ser desfeita.",
                "This invoice has no items and will be removed along with its automatically generated entry. This action cannot be undone.",
              )}
            </p>
          </div>
          <div className="invoice-delete-context" style={{ "--invoice-color": invoice.color || "var(--primary)" }}>
            <span><CalendarDays size={18} /></span>
            <div>
              <small>{copy("Vence em", "Due on")}</small>
              <strong>{invoice.name}</strong>
            </div>
            <em>{formatDateWithWeekday(invoice.due_date)}</em>
          </div>
        </div>

        <footer className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={deleting}>{copy("Cancelar", "Cancel")}</button>
          <button className="btn btn-primary danger-action" type="button" onClick={confirm} disabled={deleting}>
            {deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            {deleting ? copy("Excluindo...", "Deleting...") : copy("Excluir fatura", "Delete invoice")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
