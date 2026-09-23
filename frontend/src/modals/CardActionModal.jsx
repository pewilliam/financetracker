import { Loader2, Power, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/index.ts";
import { normalizeInvoiceColor } from "../app/helpers.js";
import useModalLifecycle from "../hooks/useModalLifecycle.js";

export default function CardActionModal({ card, action, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [submitting, setSubmitting] = useState(false);
  const closeButtonRef = useRef(null);
  const deleting = action === "delete";
  const invoiceCount = card.total_invoices || 0;
  useModalLifecycle({ onClose, busy: submitting, initialFocusRef: closeButtonRef });

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(card);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-layer invoice-template-modal-layer">
      <button className="modal-backdrop" type="button" onClick={submitting ? undefined : onClose} aria-label={tt("actions.cancel", "Cancelar")} />
      <section className={`modal-card wallet-modal invoice-template-action-modal ${deleting ? "danger" : "warning"}`} role="dialog" aria-modal="true" aria-labelledby="card-action-title">
        <div className="wallet-transfer-header">
          <i>{deleting ? <Trash2 size={20} /> : <Power size={20} />}</i>
          <div>
            <small>{tt("cards.cardLabel", "CARTÃO")}</small>
            <h2 id="card-action-title">{deleting ? tt("cards.delete", "Excluir cartão") : tt("cards.disable", "Desativar cartão")}</h2>
            <p>{deleting ? tt("cards.deleteHint", "Revise os impactos antes de excluir.") : tt("cards.disableHint", "O cartão poderá ser reativado depois.")}</p>
          </div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} disabled={submitting} aria-label={tt("actions.close", "Fechar modal")}><X size={18} /></button>
        </div>
        <div className="wallet-modal-body invoice-template-action-body">
          <p>
            {deleting
              ? invoiceCount > 0
                ? tt("cards.deleteEmptyInvoices", `O cartão e ${invoiceCount} ${invoiceCount === 1 ? "fatura vazia vinculada" : "faturas vazias vinculadas"} serão excluídos definitivamente.`, { count: invoiceCount })
                : tt("cards.deleteMessage", "O cartão será excluído definitivamente. Esta ação não pode ser desfeita.")
              : tt("cards.disableMessage", "As faturas já criadas serão preservadas. O cartão deixará de receber novas compras.")}
          </p>
          <div className="invoice-template-action-context">
            <i style={{ "--invoice-color": normalizeInvoiceColor(card.color) }} />
            <strong>{card.name}</strong>
          </div>
        </div>
        <footer className="wallet-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>{tt("actions.cancel", "Cancelar")}</button>
          <button className={`btn btn-primary ${deleting ? "danger-action" : "warning-action"}`} type="button" onClick={confirm} disabled={submitting}>
            {submitting
              ? <><Loader2 className="spin" size={16} /> {tt("actions.saving", "Salvando...")}</>
              : <>{deleting ? <Trash2 size={16} /> : <Power size={16} />}{deleting ? tt("cards.deleteAction", "Excluir") : tt("cards.disableAction", "Desativar")}</>}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
