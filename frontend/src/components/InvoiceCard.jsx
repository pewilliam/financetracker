import { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, CheckCircle2, ChevronRight, CircleDollarSign, CircleMinus, CreditCard, Pencil, Plus, RotateCcw, Tag, Trash2, X } from "lucide-react";
import DateField from "./DateField.jsx";
import { useI18n } from "../i18n/index.ts";
import { invoiceAcceptsNewCharges } from "../app/helpers.js";
import { daysUntil, formatDateShort, formatMoney, getDaysUntil } from "../utils/format.js";

function invoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : "#14A078";
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function InvoiceCategoryIcons({ categories = [] }) {
  const [tooltip, setTooltip] = useState(null);

  const showTooltip = (event, category) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const below = rect.top < 70;
    setTooltip({
      category,
      below,
      left: Math.min(window.innerWidth - 110, Math.max(110, rect.left + rect.width / 2)),
      top: below ? rect.bottom + 9 : rect.top - 9,
    });
  };

  return (
    <>
      <span className="invoice-item-category-icons">
        {categories.map((category) => (
          <span
            className="invoice-category-icon"
            style={{ "--category-color": category.color }}
            onMouseEnter={(event) => showTooltip(event, category)}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event, category)}
            onBlur={() => setTooltip(null)}
            aria-label={`Categoria: ${category.name}`}
            tabIndex="0"
            key={category.id}
          >
            <Tag size={12} />
          </span>
        ))}
      </span>
      {tooltip && createPortal(
        <span
          className={`invoice-category-tooltip ${tooltip.below ? "below" : "above"}`}
          style={{ "--category-color": tooltip.category.color, left: tooltip.left, top: tooltip.top }}
          role="tooltip"
        >
          <Tag size={13} />
          <strong>{tooltip.category.name}</strong>
        </span>,
        document.body,
      )}
    </>
  );
}

function InstallmentBadge({ item, language, onView }) {
  const [tooltip, setTooltip] = useState(null);

  const showTooltip = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const below = rect.top < 110;
    setTooltip({
      below,
      left: Math.min(window.innerWidth - 120, Math.max(120, rect.left + rect.width / 2)),
      top: below ? rect.bottom + 9 : rect.top - 9,
    });
  };

  return (
    <>
      <button
        className="installment-badge"
        type="button"
        onClick={() => { setTooltip(null); onView?.(item.purchase_id); }}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltip(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltip(null)}
        aria-label={`Parcela ${item.installment_number} de ${item.installment_count}`}
      >
        <span className="installment-badge-full">{item.installment_number}/{item.installment_count}</span>
        <span className="installment-badge-short">{item.installment_number}/{item.installment_count}</span>
      </button>
      {tooltip && createPortal(
        <span
          className={`installment-detail-tooltip ${tooltip.below ? "below" : "above"}`}
          style={{ left: tooltip.left, top: tooltip.top }}
          role="tooltip"
        >
          <span className="installment-detail-tooltip-icon"><CreditCard size={15} /></span>
          <span>
            <small>{language === "en-US" ? "INSTALLMENT PURCHASE" : "COMPRA PARCELADA"}</small>
            <strong>{language === "en-US" ? `Installment ${item.installment_number} of ${item.installment_count}` : `Parcela ${item.installment_number} de ${item.installment_count}`}</strong>
            <em>
              {language === "en-US"
                ? `${item.remaining_installments} remaining · Total ${formatMoney(item.purchase_total_amount, language)}`
                : `${item.remaining_installments} restante(s) · Total ${formatMoney(item.purchase_total_amount, language)}`}
            </em>
          </span>
        </span>,
        document.body,
      )}
    </>
  );
}

export default function InvoiceCard({ invoice, expenseOptions = [], onManageReceivable, allowOverdueInvoiceEdits = false, onAddEntry, onEditItem, onUpdateDueDate, onDeleteItem, onDeleteInstallmentItem, onTogglePaid, onViewInstallment }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [itemsOpen, setItemsOpen] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateDraft, setDueDateDraft] = useState(invoice.due_date);
  const [savingDueDate, setSavingDueDate] = useState(false);
  const status = daysUntil(invoice.due_date);
  const overdue = !invoice.paid && getDaysUntil(invoice.due_date) <= 0;
  const regularItems = invoice.items || [];
  const installmentItems = invoice.installment_items || [];
  const canAddToInvoice = invoiceAcceptsNewCharges(invoice, allowOverdueInvoiceEdits);
  const canEditDueDate = canAddToInvoice;
  const totalItemCount = regularItems.length + installmentItems.length;
  const singleMainItem = totalItemCount === 1
    && regularItems.length === 1
    && normalizeName(regularItems[0].description) === normalizeName(invoice.name);
  const canToggleItems = totalItemCount !== 1 || !singleMainItem;
  const itemsExpanded = itemsOpen;
  const viewItemsLabel = language === "en-US" ? `View items (${totalItemCount})` : `Ver itens (${totalItemCount})`;
  const hideItemsLabel = language === "en-US" ? "Hide items" : "Ocultar itens";
  const addItemLabel = language === "en-US" ? "Add item" : "Adicionar item";
  const addRefundLabel = language === "en-US" ? "Add refund" : "Adicionar reembolso";
  const addItemShortLabel = language === "en-US" ? "New item" : "Novo item";
  const addRefundShortLabel = language === "en-US" ? "Refund" : "Reembolso";
  const refundLabel = language === "en-US" ? "Refund" : "Reembolso";

  const startEditingDueDate = () => {
    if (!canEditDueDate) return;
    setDueDateDraft(invoice.due_date);
    setEditingDueDate(true);
  };

  const cancelEditingDueDate = () => {
    setDueDateDraft(invoice.due_date);
    setEditingDueDate(false);
  };

  const saveDueDate = async () => {
    if (!dueDateDraft || dueDateDraft === invoice.due_date || savingDueDate) {
      setEditingDueDate(false);
      return;
    }
    setSavingDueDate(true);
    try {
      await onUpdateDueDate(invoice.id, dueDateDraft);
      setEditingDueDate(false);
    } finally {
      setSavingDueDate(false);
    }
  };

  const startEditingItem = (item) => {
    onEditItem?.(invoice, item);
  };

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

  const renderRegularItem = (item) => {
    const refund = Number(item.amount) < 0;
    const itemCategories = item.categories?.length ? item.categories : item.category ? [item.category] : [];
    return (
      <div className={`invoice-item ${refund ? "refund-line" : ""}`} key={`item-${item.id}`}>
        <div className="invoice-item-main">
          <span className="invoice-item-description">
            {refund && <em className="refund-badge">{refundLabel}</em>}
            <span className="invoice-item-name">{item.description}</span>
            <InvoiceCategoryIcons categories={itemCategories} />
          </span>
        </div>
        <strong>{formatMoney(item.amount)}</strong>
        <span className="invoice-item-actions">
          <button className="icon-btn small" type="button" onClick={() => startEditingItem(item)} aria-label={language === "en-US" ? "Edit item" : "Editar item"}>
            <Pencil size={15} />
          </button>
          <button className="icon-btn small danger" type="button" onClick={() => onDeleteItem(invoice.id, item.id)} aria-label={refund ? (language === "en-US" ? "Remove refund" : "Remover reembolso") : tt("invoiceModels.delete", "Remover item")}>
            <Trash2 size={15} />
          </button>
        </span>
      </div>
    );
  };

  return (
    <article className={`invoice-card card ${invoice.paid ? "paid" : ""}`} style={{ "--invoice-color": invoiceColor(invoice.color) }}>
      <header className="invoice-header">
        <div className="invoice-header-main">
          <h3><span className="invoice-color-dot" />{invoice.name}</h3>
          {editingDueDate ? (
            <div className="invoice-due-editor">
              <DateField className="compact" value={dueDateDraft} onChange={setDueDateDraft} />
              <button className="icon-btn small" type="button" onClick={saveDueDate} disabled={savingDueDate || !dueDateDraft} aria-label={language === "en-US" ? "Save due date" : "Salvar vencimento"}>
                <Check size={15} />
              </button>
              <button className="icon-btn small" type="button" onClick={cancelEditingDueDate} disabled={savingDueDate} aria-label={language === "en-US" ? "Cancel date edit" : "Cancelar edicao de data"}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="invoice-due-summary">
              <p className="invoice-due-line">
                <CalendarDays size={14} />
                <span className="invoice-due-copy">
                  <small>{tt("invoices.dueOn", "Vencimento em")}</small>
                  <strong>{formatDateShort(invoice.due_date)}</strong>
                </span>
              </p>
              {canEditDueDate && (
                <button className="invoice-date-edit" type="button" onClick={startEditingDueDate} aria-label={language === "en-US" ? "Edit due date" : "Editar vencimento"}>
                  <Pencil size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="invoice-status-actions">
          <span className={`due-badge ${invoice.paid ? "paid" : overdue ? "danger" : ""}`}>
            {invoice.paid ? (language === "en-US" ? "PAID" : "PAGA") : status}
          </span>
        </div>
      </header>

      <div className="invoice-total-row">
        <span>{tt("invoices.total", "Total")}</span>
        <strong>{formatMoney(invoice.total_amount)}</strong>
      </div>

      {canToggleItems && (
        <button className={`invoice-items-toggle ${itemsExpanded ? "open" : ""}`} type="button" onClick={() => setItemsOpen((current) => !current)} aria-expanded={itemsExpanded}>
          <ChevronRight size={16} />
          <span>{itemsExpanded ? hideItemsLabel : viewItemsLabel}</span>
        </button>
      )}

      {canToggleItems && (
        <div className={`invoice-items-panel ${itemsExpanded ? "open" : ""}`}>
          <div className="invoice-items-panel-inner">
            <div className="invoice-items">
              {totalItemCount ? (
                <>
                  {regularItems.map(renderRegularItem)}
                  {installmentItems.map((item) => (
                    <div
                      className="invoice-item installment-line"
                      key={`installment-${item.id}`}
                    >
                      <div className="invoice-item-main">
                        <span className="invoice-item-description">
                          <InstallmentBadge item={item} language={language} onView={onViewInstallment} />
                          <span className="invoice-item-name">{item.purchase_description || item.description}</span>
                          <InvoiceCategoryIcons categories={item.categories?.length ? item.categories : item.category ? [item.category] : []} />
                        </span>
                      </div>
                      <strong>{formatMoney(item.amount)}</strong>
                      <span className="invoice-item-actions">
                        <button className="icon-btn small" type="button" onClick={() => onManageReceivable?.(expenseOptions.find((option) => option.source_type === "installment_item" && option.source_id === item.id))} aria-label="Associar recebível" title="Associar recebível">
                          <CircleDollarSign size={15} />
                        </button>
                        <button className="icon-btn small danger" type="button" onClick={() => onDeleteInstallmentItem(item.id)} aria-label="Remover parcela">
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </div>
                  ))}
                </>
              ) : <p className="muted">{tt("invoices.noItems", "Sem itens ainda.")}</p>}
            </div>
          </div>
        </div>
      )}

      {!canToggleItems && (
        <div className="invoice-single-item-panel">
          {regularItems.map(renderRegularItem)}
        </div>
      )}

      {canAddToInvoice && renderQuickAddActions()}

      <div className="invoice-actions">
        <button className={`btn ${invoice.paid ? "btn-ghost" : "btn-primary"}`} onClick={() => onTogglePaid(invoice.id, !invoice.paid)}>
          {invoice.paid ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
          {invoice.paid ? tt("invoices.markAsPending", "Marcar pendente") : tt("invoices.markAsPaid", "Marcar paga")}
        </button>
      </div>
    </article>
  );
}
