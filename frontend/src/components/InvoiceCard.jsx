import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, CheckCircle2, ChevronRight, CircleMinus, CreditCard, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { daysUntil, formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, getDaysUntil, parseTypedMoneyInput } from "../utils/format.js";

function invoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : "#14A078";
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export default function InvoiceCard({ invoice, onAddItem, onAddInstallment, onDeleteItem, onDeleteInstallmentItem, onTogglePaid, onDuplicateNext, onViewInstallment }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [addMode, setAddMode] = useState(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const adding = addMode !== null;
  const addingRefund = addMode === "refund";
  const status = daysUntil(invoice.due_date);
  const overdue = !invoice.paid && getDaysUntil(invoice.due_date) <= 0;
  const regularItems = invoice.items || [];
  const installmentItems = invoice.installment_items || [];
  const totalItemCount = regularItems.length + installmentItems.length;
  const singleMainItem = totalItemCount === 1
    && regularItems.length === 1
    && normalizeName(regularItems[0].description) === normalizeName(invoice.name);
  const canToggleItems = totalItemCount !== 1 || !singleMainItem;
  const itemsExpanded = itemsOpen || adding;
  const viewItemsLabel = language === "en-US" ? `View items (${totalItemCount})` : `Ver itens (${totalItemCount})`;
  const hideItemsLabel = language === "en-US" ? "Hide items" : "Ocultar itens";
  const addItemLabel = language === "en-US" ? "Add item" : "Adicionar item";
  const addRefundLabel = language === "en-US" ? "Add refund" : "Adicionar reembolso";
  const addItemToInvoiceLabel = language === "en-US" ? "+ Add item to invoice" : "+ Adicionar item à fatura";
  const addRefundToInvoiceLabel = language === "en-US" ? "+ Add refund to invoice" : "+ Adicionar reembolso à fatura";
  const cancelLabel = tt("actions.cancel", "Cancelar");
  const refundLabel = language === "en-US" ? "Refund" : "Reembolso";
  const refundDescriptionLabel = language === "en-US" ? "Refund description" : "Descrição do reembolso";
  const amountPlaceholder = addingRefund
    ? (language === "en-US" ? "Refund amount" : "Valor reembolsado")
    : "R$ 0,00";
  const submitLabel = addingRefund
    ? (language === "en-US" ? "Refund" : "Reembolsar")
    : tt("invoices.add", "Adicionar");

  const handleSubmit = (event) => {
    event.preventDefault();
    const parsed = parseTypedMoneyInput(amount, language);
    const cleanDescription = description.trim();
    if (!parsed || (!addingRefund && !cleanDescription)) return;
    onAddItem(invoice.id, {
      description: cleanDescription || refundLabel,
      amount: addingRefund ? -Math.abs(parsed) : parsed
    });
    setDescription("");
    setAmount("");
    setAddMode(null);
  };

  const startAdding = (mode = "item") => {
    if (canToggleItems) setItemsOpen(true);
    setAddMode(mode);
  };

  const cancelAdding = () => {
    setDescription("");
    setAmount("");
    setAddMode(null);
  };

  const renderAddChoices = (single = false) => (
    <div className={single ? "invoice-single-add-actions" : "invoice-inline-actions"}>
      <button className={single ? "invoice-single-add-link" : "add-inline"} type="button" onClick={() => startAdding("item")}>
        <Plus size={16} />
        {single ? addItemToInvoiceLabel : addItemLabel}
      </button>
      <button className={`${single ? "invoice-single-add-link" : "add-inline"} refund`} type="button" onClick={() => startAdding("refund")}>
        <CircleMinus size={16} />
        {single ? addRefundToInvoiceLabel : addRefundLabel}
      </button>
    </div>
  );

  const renderAddForm = () => (
    <form className={`inline-form ${addingRefund ? "refund-form" : ""}`} onSubmit={handleSubmit}>
      <input placeholder={addingRefund ? refundDescriptionLabel : tt("invoices.description", "Descrição")} value={description} onChange={(event) => setDescription(event.target.value)} />
      <input inputMode="decimal" placeholder={amountPlaceholder} value={amount} onChange={(event) => setAmount(formatTypedMoneyForEditing(event.target.value, language))} onBlur={() => setAmount(formatTypedMoneyAsCurrency(amount, language))} />
      <div className="inline-form-actions">
        <button className="btn btn-primary compact inline-add-submit" type="submit">
          <span className="inline-add-submit-text">{submitLabel}</span>
          <span className="inline-add-submit-symbol" aria-hidden="true">{addingRefund ? "-" : "+"}</span>
        </button>
        <button className="inline-form-cancel" type="button" onClick={cancelAdding}>
          <span aria-hidden="true">×</span>
          {cancelLabel}
        </button>
      </div>
    </form>
  );

  return (
    <article className={`invoice-card card ${invoice.paid ? "paid" : ""}`} style={{ "--invoice-color": invoiceColor(invoice.color) }}>
      <header className="invoice-header">
        <div>
          <h3><span className="invoice-color-dot" />{invoice.name}</h3>
          <p>{tt("invoices.dueOn", "Vencimento em")} {formatDateShort(invoice.due_date)}</p>
        </div>
        <span className={`due-badge ${invoice.paid ? "paid" : overdue ? "danger" : ""}`}>
          {invoice.paid ? (language === "en-US" ? "PAID" : "PAGA") : status}
        </span>
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
                  {regularItems.map((item) => {
                    const refund = Number(item.amount) < 0;
                    return (
                      <div className={`invoice-item ${refund ? "refund-line" : ""}`} key={`item-${item.id}`}>
                        <span>
                          {refund && <em className="refund-badge">{refundLabel}</em>}
                          {item.description}
                        </span>
                        <strong>{formatMoney(item.amount)}</strong>
                        <button className="icon-btn small danger" type="button" onClick={() => onDeleteItem(invoice.id, item.id)} aria-label={refund ? (language === "en-US" ? "Remove refund" : "Remover reembolso") : tt("invoiceModels.delete", "Remover item")}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                  {installmentItems.map((item) => (
                    <div
                      className="invoice-item installment-line"
                      key={`installment-${item.id}`}
                      title={`Compra: ${formatMoney(item.purchase_total_amount)} em ${item.installment_count}x - parcelas restantes: ${item.remaining_installments}`}
                    >
                      <span>
                        <button className="installment-badge" type="button" onClick={() => onViewInstallment(item.purchase_id)}>
                          <span className="installment-badge-full">{item.installment_number}/{item.installment_count}</span>
                          <span className="installment-badge-short">{item.installment_number}/{item.installment_count}</span>
                        </button>
                        {item.purchase_description || item.description}
                      </span>
                      <strong>{formatMoney(item.amount)}</strong>
                      <button className="icon-btn small danger" type="button" onClick={() => onDeleteInstallmentItem(item.id)} aria-label="Remover parcela">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </>
              ) : <p className="muted">{tt("invoices.noItems", "Sem itens ainda.")}</p>}
            </div>

            {adding ? renderAddForm() : renderAddChoices()}
          </div>
        </div>
      )}

      {!canToggleItems && (
        adding ? (
          <div className="invoice-single-add">
            {renderAddForm()}
          </div>
        ) : (
          renderAddChoices(true)
        )
      )}

      <div className="invoice-template-footer">
        <Link to={`/modelos-de-fatura#template-${invoice.template_id}`}>{tt("invoices.model", "Modelo:")} {invoice.name} →</Link>
      </div>
      <div className="invoice-actions">
        <button className="btn btn-ghost" onClick={() => onDuplicateNext(invoice)}>
          <CalendarPlus size={16} />
          {tt("invoices.nextInvoice", "Próxima fatura")}
        </button>
        <button className="btn btn-ghost" onClick={() => onAddInstallment(invoice)}>
          <CreditCard size={16} />
          {tt("invoices.installment", "+ Parcela")}
        </button>
        <button className={`btn ${invoice.paid ? "btn-ghost" : "btn-primary"}`} onClick={() => onTogglePaid(invoice.id, !invoice.paid)}>
          {invoice.paid ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
          {invoice.paid ? tt("invoices.markAsPending", "Marcar pendente") : tt("invoices.markAsPaid", "Marcar paga")}
        </button>
      </div>
    </article>
  );
}
