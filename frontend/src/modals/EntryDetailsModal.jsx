import { useEffect, useRef } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Link2,
  Pencil,
  ReceiptText,
  Repeat2,
  Tag,
  X,
} from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

function categoriesFor(item) {
  if (item?.categories?.length) return item.categories;
  return item?.category ? [item.category] : [];
}

function formatCreatedAt(value, language) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function EntryDetailsModal({
  item,
  context = "transaction",
  invoice,
  insight,
  onClose,
  onEdit,
  onViewInstallment,
}) {
  const { language } = useI18n();
  const closeButtonRef = useRef(null);
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const isTransaction = context === "transaction";
  const isInstallment = context === "installment";
  const isIncome = isTransaction && item.type === "income";
  const isRefund = !isTransaction && Number(item.amount) < 0;
  const tone = isInstallment ? "installment" : isIncome || isRefund ? "income" : "expense";
  const description = item.purchase_description || item.description || copy("Sem descrição", "No description");
  const categories = categoriesFor(item);
  const createdAt = formatCreatedAt(item.created_at, language);
  const detailDate = isTransaction ? item.date : invoice?.due_date;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const Icon = isInstallment
    ? CreditCard
    : isIncome || isRefund
      ? ArrowUpRight
      : ArrowDownLeft;
  const eyebrow = isInstallment
    ? copy("Compra parcelada", "Installment purchase")
    : isTransaction
      ? copy("Detalhes do lançamento", "Entry details")
      : copy("Item da fatura", "Invoice item");
  const nature = isInstallment
    ? copy("Parcela", "Installment")
    : isIncome
      ? copy("Ganho", "Income")
      : isRefund
        ? copy("Reembolso", "Refund")
        : copy("Gasto", "Expense");

  const installmentStatus = item.status === "refunded"
    ? copy("Reembolsada", "Refunded")
    : item.status === "canceled"
      ? copy("Cancelada", "Canceled")
      : invoice?.paid
        ? copy("Paga", "Paid")
        : copy("Pendente", "Pending");

  return (
    <div className="modal-layer entry-details-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={copy("Fechar detalhes", "Close details")} />
      <section className={`modal-card entry-details-modal ${tone}`} role="dialog" aria-modal="true" aria-labelledby="entry-details-title">
        <header className="entry-details-header">
          <div className="entry-details-icon"><Icon size={22} /></div>
          <div className="entry-details-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="entry-details-title">{description}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} aria-label={copy("Fechar modal", "Close modal")}><X size={18} /></button>
        </header>

        <div className="entry-details-body">
          <div className="entry-details-amount">
            <span>{copy("Valor", "Amount")}</span>
            <strong>{formatMoney(item.amount, language)}</strong>
            <em>{nature}</em>
          </div>

          <div className="entry-details-grid">
            <div className="entry-detail-field">
              <span><ReceiptText size={15} /> {copy("Natureza", "Type")}</span>
              <strong>{nature}</strong>
            </div>
            {detailDate && (
              <div className="entry-detail-field">
                <span><CalendarDays size={15} /> {isTransaction ? copy("Data", "Date") : copy("Vencimento", "Due date")}</span>
                <strong>{formatDateShort(detailDate, language)}</strong>
              </div>
            )}
            {invoice && (
              <div className="entry-detail-field">
                <span><CreditCard size={15} /> {copy("Fatura", "Invoice")}</span>
                <strong>{invoice.name}</strong>
                <small>{invoice.paid ? copy("Fatura paga", "Paid invoice") : copy("Fatura em aberto", "Open invoice")}</small>
              </div>
            )}
            {isInstallment && (
              <div className="entry-detail-field">
                <span><Repeat2 size={15} /> {copy("Parcela", "Installment")}</span>
                <strong>{item.installment_number} de {item.installment_count}</strong>
                <small>
                  {item.remaining_installments} {language === "en-US"
                    ? (item.remaining_installments === 1 ? "remaining installment" : "remaining installments")
                    : (item.remaining_installments === 1 ? "parcela restante" : "parcelas restantes")}
                </small>
              </div>
            )}
            {isInstallment && (
              <div className="entry-detail-field">
                <span><CreditCard size={15} /> {copy("Total da compra", "Purchase total")}</span>
                <strong>{formatMoney(item.purchase_total_amount, language)}</strong>
              </div>
            )}
            {isInstallment && (
              <div className="entry-detail-field">
                <span><CheckCircle2 size={15} /> {copy("Status", "Status")}</span>
                <strong>{installmentStatus}</strong>
              </div>
            )}
            {item.recurrence_id && (
              <div className="entry-detail-field">
                <span><Repeat2 size={15} /> {copy("Recorrência", "Recurrence")}</span>
                <strong>{copy("Lançamento recorrente", "Recurring entry")}</strong>
              </div>
            )}
            {isTransaction && item.is_future && (
              <div className="entry-detail-field">
                <span><Clock3 size={15} /> {copy("Situação", "Status")}</span>
                <strong>{copy("Lançamento previsto", "Scheduled entry")}</strong>
              </div>
            )}
            {createdAt && (
              <div className="entry-detail-field entry-detail-created">
                <span><Clock3 size={15} /> {copy("Cadastrado em", "Created at")}</span>
                <strong>{createdAt}</strong>
              </div>
            )}
            <section className={`entry-detail-field entry-detail-categories ${insight ? "has-insight" : ""}`}>
              <span><Tag size={15} /> {categories.length === 1 ? copy("Categoria", "Category") : copy("Categorias", "Categories")}</span>
              <div>
                {categories.length ? categories.map((category) => (
                  <span className="transaction-category-pill" style={{ "--category-color": category.color }} key={category.id}>{category.name}</span>
                )) : <em>{copy("Sem categoria", "Uncategorized")}</em>}
              </div>
              {insight && (
                <div className="entry-category-insight">
                  <div>
                    <strong>{insight.label}</strong>
                    <small>{insight.shareLabel}</small>
                  </div>
                  <span className="entry-category-progress" aria-hidden="true"><i style={{ width: `${insight.share}%` }} /></span>
                </div>
              )}
            </section>
          </div>

          {item.linked_expense && (
            <section className="entry-linked-expense">
              <div className="entry-linked-expense-icon"><Link2 size={17} /></div>
              <div>
                <span>{copy("Gasto associado", "Linked expense")}</span>
                <strong>{item.linked_expense.description}</strong>
                <small>
                  {item.linked_expense.invoice_name ? `${item.linked_expense.invoice_name} · ` : ""}
                  {formatDateShort(item.linked_expense.date, language)}
                </small>
              </div>
              <strong>{formatMoney(item.linked_expense.amount, language)}</strong>
            </section>
          )}
        </div>

        <footer className="entry-details-footer">
          {isInstallment && onViewInstallment && (
            <button className="btn entry-details-edit installment-action" type="button" onClick={() => onViewInstallment(item.purchase_id)}>
              <CreditCard size={16} /> {copy("Ver compra completa", "View full purchase")}
            </button>
          )}
          {!isInstallment && onEdit && (
            <button className="btn entry-details-edit" type="button" onClick={onEdit}>
              <Pencil size={16} /> {isTransaction ? copy("Editar lançamento", "Edit entry") : copy("Editar item", "Edit item")}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
