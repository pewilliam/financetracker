import { CalendarDays, CheckCircle2, ChevronRight, CircleMinus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { invoiceAcceptsNewCharges } from "../app/helpers.js";
import { daysUntil, formatDateShort, formatDateWithWeekday, formatMoney, getDaysUntil } from "../utils/format.js";

function invoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : "#14A078";
}

export default function InvoiceCard({ invoice, allowOverdueInvoiceEdits = false, onAddEntry, onOpenItems, onEditDueDate, onTogglePaid, onDelete }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const status = daysUntil(invoice.due_date);
  const overdue = !invoice.paid && !invoice.is_projected && getDaysUntil(invoice.due_date) <= 0;
  const itemsKnown = invoice.items_included !== false;
  const regularItems = invoice.items || [];
  const installmentItems = invoice.installment_items || [];
  const projectedItems = invoice.projected_items || [];
  const projectedAmount = Number(invoice.projected_amount || 0);
  const hasProjection = projectedAmount > 0;
  const projectedTotal = Number(invoice.projected_total ?? Number(invoice.total_amount || 0) + projectedAmount);
  const canAddToInvoice = !invoice.is_projected && invoiceAcceptsNewCharges(invoice, allowOverdueInvoiceEdits);
  const canEditDueDate = canAddToInvoice;
  const totalItemCount = itemsKnown
    ? regularItems.length + installmentItems.length + projectedItems.length
    : Number(invoice.item_count || 0) + Number(invoice.installment_item_count || 0) + Number(invoice.projected_item_count || projectedItems.length || 0);
  const refundTotal = regularItems.reduce((total, item) => Number(item.amount) < 0 ? total + Math.abs(Number(item.amount)) : total, 0);
  const viewItemsLabel = language === "en-US"
    ? `View items (${totalItemCount})`
    : `Ver itens (${totalItemCount})`;
  const addItemLabel = language === "en-US" ? "Add item" : "Adicionar item";
  const addRefundLabel = language === "en-US" ? "Add refund" : "Adicionar reembolso";
  const addItemShortLabel = language === "en-US" ? "New item" : "Novo item";
  const addRefundShortLabel = language === "en-US" ? "Refund" : "Reembolso";
  const refundLabel = language === "en-US" ? "Refund" : "Reembolso";
  const deleteLabel = language === "en-US" ? "Delete invoice" : "Excluir fatura";
  const canDelete = totalItemCount === 0 && Boolean(onDelete);
  const dueLabel = language === "en-US" ? "Due" : "Vence";
  const dueYear = Number(String(invoice.due_date).slice(0, 4));
  const dueDateLabel = dueYear === new Date().getFullYear()
    ? formatDateWithWeekday(invoice.due_date)
    : `${formatDateWithWeekday(invoice.due_date)} ${dueYear}`;

  const renderQuickAddActions = () => (
    <div className="invoice-quick-add-actions">
      <button className="invoice-quick-add-button item" type="button" onClick={() => onAddEntry?.(invoice, "expense")} aria-label={addItemLabel}>
        <Plus size={16} />
        <span className="invoice-quick-add-label-full">{addItemLabel}</span>
        <span className="invoice-quick-add-label-short">{addItemShortLabel}</span>
      </button>
      <button className="invoice-quick-add-button refund" type="button" onClick={() => onAddEntry?.(invoice, "refund")} aria-label={addRefundLabel}>
        <CircleMinus size={16} />
        <span className="invoice-quick-add-label-full">{addRefundLabel}</span>
        <span className="invoice-quick-add-label-short">{addRefundShortLabel}</span>
      </button>
    </div>
  );

  return (
    <article className={`invoice-card card ${invoice.paid ? "paid" : ""} ${overdue ? "overdue" : ""} ${invoice.is_projected ? "is-projected" : ""}`} style={{ "--invoice-color": invoiceColor(invoice.color) }}>
      <header className="invoice-header">
        <div className="invoice-header-top">
          <h3><span className="invoice-color-dot" />{invoice.name}</h3>
          <span className={`due-badge ${invoice.paid ? "paid" : overdue ? "danger" : ""}`}>
            {invoice.is_projected
              ? tt("invoices.projectedInvoice", "Prevista")
              : invoice.paid ? (language === "en-US" ? "PAID" : "PAGA") : status}
          </span>
        </div>
        <div className={`invoice-amounts ${hasProjection ? "has-projection" : ""}`}>
          <p className="invoice-amount">
            <small>{tt("invoices.total", "Total")}</small>
            <strong>{formatMoney(invoice.total_amount)}</strong>
          </p>
          {hasProjection && (
            <p className="invoice-amount is-projected">
              <small>{tt("invoices.projected", "Previsto")}</small>
              <strong>{formatMoney(projectedTotal)}</strong>
            </p>
          )}
        </div>
        {canEditDueDate ? (
          <button
            className="invoice-due-summary is-editable"
            type="button"
            onClick={() => onEditDueDate?.(invoice)}
            aria-haspopup="dialog"
            aria-label={`${language === "en-US" ? "Edit due date" : "Editar vencimento"}: ${formatDateShort(invoice.due_date)}`}
            title={formatDateShort(invoice.due_date)}
          >
            <CalendarDays size={14} />
            <span className="invoice-due-copy">
              <small>{dueLabel}</small>
              <strong>{dueDateLabel}</strong>
            </span>
            <Pencil size={12} className="invoice-due-pencil" />
          </button>
        ) : (
          <p className="invoice-due-summary" title={formatDateShort(invoice.due_date)}>
            <CalendarDays size={14} />
            <span className="invoice-due-copy">
              <small>{dueLabel}</small>
              <strong>{dueDateLabel}</strong>
            </span>
          </p>
        )}
      </header>

      {totalItemCount === 0 && (
        <div className="invoice-items">
          <p className="muted">{tt("invoices.noItems", "Sem itens ainda.")}</p>
        </div>
      )}

      {totalItemCount > 0 && (
        <button
          className="invoice-items-toggle"
          type="button"
          onClick={() => onOpenItems?.(invoice)}
          aria-haspopup="dialog"
        >
          <ChevronRight size={16} />
          <span>{viewItemsLabel}</span>
          {refundTotal > 0 && (
            <em className="invoice-refund-chip" title={`${refundLabel}: ${formatMoney(refundTotal)}`}>
              <CircleMinus size={12} />{formatMoney(refundTotal)}
            </em>
          )}
        </button>
      )}

      {(canAddToInvoice || (!invoice.is_projected && (totalItemCount > 0 || canDelete))) && <div className="invoice-card-footer">
        {canAddToInvoice && renderQuickAddActions()}
        {!invoice.is_projected && (totalItemCount > 0 || canDelete) && (
          <div className="invoice-actions">
            {totalItemCount > 0 ? (
              <button className={`btn ${invoice.paid ? "btn-ghost" : "btn-primary"}`} onClick={() => onTogglePaid(invoice.id, !invoice.paid)}>
                {invoice.paid ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
                {invoice.paid ? tt("invoices.markAsPending", "Marcar pendente") : tt("invoices.markAsPaid", "Marcar paga")}
              </button>
            ) : (
              <button className="btn btn-ghost invoice-delete-btn" type="button" onClick={() => onDelete(invoice)}>
                <Trash2 size={16} /> {deleteLabel}
              </button>
            )}
          </div>
        )}
      </div>}
    </article>
  );
}
