import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Loader2, X } from "lucide-react";

import DateField from "../components/DateField.jsx";
import { useI18n } from "../i18n/index.ts";
import { daysUntil, formatDateShort, formatDateWithWeekday, getDaysUntil } from "../utils/format.js";

export default function InvoiceDueDateModal({ invoice, onSave, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const currentPayment = String(invoice.payment_date || invoice.due_date).slice(0, 10);
  const [dueDate, setDueDate] = useState(currentPayment);
  const [saving, setSaving] = useState(false);
  const changed = Boolean(dueDate) && dueDate !== currentPayment;
  const overdue = Boolean(dueDate) && getDaysUntil(dueDate) < 0;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (document.querySelector(".date-popover")) return;
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    try {
      await onSave(dueDate);
    } catch {
      // A página exibe o erro e mantém a data escolhida para uma nova tentativa.
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-layer transaction-modal-layer invoice-due-date-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form className="modal-card transaction-modal invoice-due-date-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="invoice-due-date-modal-title">
        <header className="transaction-entry-titlebar invoice-entry-titlebar compact">
          <span className="transaction-entry-icon"><CalendarDays size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{copy(`FATURA · ${invoice.name}`, `INVOICE · ${invoice.name}`)}</p>
            <h2 id="invoice-due-date-modal-title">{copy("Editar pagamento", "Edit payment date")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={copy("Fechar", "Close")}>
            <X size={18} />
          </button>
        </header>

        <div className="transaction-modal-body invoice-due-date-body">
          <div className="invoice-due-date-field">
            <span>{copy("Data de pagamento", "Payment date")}</span>
            <DateField value={dueDate} onChange={setDueDate} ariaInvalid={!dueDate} />
            <small>{copy(`O vencimento continua em ${formatDateShort(invoice.due_date)}. Esta data vale só para o pagamento desta fatura no controle mensal.`, `The due date stays on ${formatDateShort(invoice.due_date)}. This date is only this invoice's payment on monthly control.`)}</small>
          </div>

          <div className={`invoice-due-date-preview ${overdue ? "overdue" : ""}`}>
            <CalendarDays size={16} />
            <span>
              <small>{changed ? copy("Novo pagamento", "New payment date") : copy("Pagamento atual", "Current payment date")}</small>
              <strong>{dueDate ? formatDateWithWeekday(dueDate) : "--"}</strong>
            </span>
            {dueDate && <em>{daysUntil(dueDate)}</em>}
          </div>
        </div>

        <footer className="transaction-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{copy("Cancelar", "Cancel")}</button>
          <button className="btn btn-primary transaction-save" type="submit" disabled={!changed || saving}>
            {saving
              ? <><Loader2 className="spin" size={16} /> {copy("Salvando...", "Saving...")}</>
              : copy("Salvar pagamento", "Save payment date")}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
