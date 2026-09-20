import { useEffect, useMemo, useRef, useState } from "react";
import { Layers3, Loader2, Pencil, Trash2, X } from "lucide-react";
import CategorySelect from "../components/CategorySelect.jsx";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";
import EditInstallmentItemModal from "./EditInstallmentItemModal.jsx";

function itemStatus(item, invoice = item.invoice, copy = (pt) => pt) {
  if (item.status === "refunded") return { label: copy("Reembolsada", "Refunded"), tone: "refunded" };
  if (item.status === "canceled") return { label: copy("Cancelada", "Canceled"), tone: "danger" };
  if (invoice?.paid) return { label: copy("Paga", "Paid"), tone: "paid" };
  if (!invoice) return { label: copy("Sem fatura", "No invoice"), tone: "neutral" };
  if (invoice.due_date < new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)) {
    return { label: copy("Atrasada", "Overdue"), tone: "danger" };
  }
  return { label: copy("Pendente", "Pending"), tone: "pending" };
}

function isPaidInstallment(item) {
  return item.status !== "canceled" && Boolean(item.invoice?.paid);
}

function purchaseCategories(purchase) {
  return purchase.categories?.length ? purchase.categories : purchase.category ? [purchase.category] : [];
}

export default function InstallmentDetailsModal({
  purchase,
  invoices,
  categories = [],
  onCreateCategory,
  allowOverdueInvoiceEdits = false,
  onClose,
  onRequestDelete,
  onSaveItem,
  onSaveCategory,
}) {
  const { language } = useI18n();
  const copy = (pt, en) => (language === "en-US" ? en : pt);
  const closeButtonRef = useRef(null);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryIds, setCategoryIds] = useState(
    (purchase.category_ids?.length ? purchase.category_ids : purchase.category_id ? [purchase.category_id] : []).map(String),
  );
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(Boolean(purchase.__startEditing));
  const nextId = purchase.next_installment?.id;
  const categoryList = purchaseCategories(purchase);
  const firstInvoice = purchase.items?.find((entry) => entry.invoice)?.invoice;
  const purchaseDate = purchase.created_at ? formatDateShort(purchase.created_at.slice(0, 10), language) : null;

  const itemGroups = useMemo(() => {
    const open = [];
    const paid = [];
    (purchase.items || []).forEach((item) => {
      if (isPaidInstallment(item)) paid.push(item);
      else open.push(item);
    });
    const groups = [];
    if (open.length) {
      groups.push({
        id: "open",
        tone: "open",
        title: copy("Em aberto", "Open"),
        items: open,
        total: open.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      });
    }
    if (paid.length) {
      groups.push({
        id: "paid",
        tone: "paid",
        title: copy("Pagas", "Paid"),
        items: paid,
        total: paid.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      });
    }
    return groups;
  }, [language, purchase.items]);

  useModalLifecycle({
    onClose,
    busy: Boolean(editingItem) || savingCategory,
    initialFocusRef: closeButtonRef,
    autoFocus: !editingItem,
  });

  useEffect(() => {
    setCategoryIds((purchase.category_ids?.length ? purchase.category_ids : purchase.category_id ? [purchase.category_id] : []).map(String));
  }, [purchase.category_id, purchase.category_ids]);

  useEffect(() => {
    if (!editingItem) return;
    const refreshed = purchase.items?.find((entry) => entry.id === editingItem.id);
    if (refreshed && refreshed !== editingItem) setEditingItem(refreshed);
  }, [editingItem, purchase.items]);

  const saveCategory = async (value) => {
    const previous = categoryIds;
    setCategoryIds(value);
    setSavingCategory(true);
    try {
      await onSaveCategory(purchase.id, value);
    } catch {
      setCategoryIds(previous);
    } finally {
      setSavingCategory(false);
    }
  };

  const renderItem = (item) => {
    const status = itemStatus(item, item.invoice, copy);
    const dueDate = item.invoice?.due_date ? formatDateShort(item.invoice.due_date, language) : "—";
    const openEdit = () => setEditingItem(item);
    return (
      <div
        className={`installment-details-item is-clickable ${item.id === nextId ? "is-next" : ""} ${editingItem?.id === item.id ? "is-editing" : ""}`}
        role="row"
        tabIndex="0"
        key={item.id}
        onClick={openEdit}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openEdit();
          }
        }}
        aria-label={copy(`Editar parcela ${item.installment_number}`, `Edit installment ${item.installment_number}`)}
      >
        <span className="installment-item-number" role="cell">
          <small>{copy("Parcela", "Installment")}</small>
          <strong>{item.installment_number}/{purchase.installment_count}</strong>
          {item.id === nextId && <em>{copy("Próxima", "Next")}</em>}
        </span>
        <span role="cell">
          <small>{copy("Valor", "Amount")}</small>
          <strong>{formatMoney(item.amount)}</strong>
        </span>
        <span role="cell">
          <small>{copy("Fatura", "Invoice")}</small>
          <span>{item.invoice?.name || copy("Fatura removida", "Invoice removed")}</span>
        </span>
        <span role="cell">
          <small>{copy("Vencimento", "Due date")}</small>
          <span>{dueDate}</span>
        </span>
        <span role="cell">
          <small>{copy("Status", "Status")}</small>
          <span className={`installment-status ${status.tone}`}>{status.label}</span>
        </span>
        <span className="installment-row-actions" role="cell">
          <button
            className="icon-btn small"
            type="button"
            onClick={(event) => { event.stopPropagation(); openEdit(); }}
            aria-label={copy(`Editar parcela ${item.installment_number}`, `Edit installment ${item.installment_number}`)}
            title={copy("Editar valor, fatura ou status", "Edit amount, invoice, or status")}
          >
            <Pencil size={15} />
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="modal-layer installment-details-layer">
      <button className="modal-backdrop" type="button" onClick={editingItem ? undefined : onClose} aria-label={copy("Fechar detalhes", "Close details")} />
      <div className="modal-card invoice-modal installment-details-modal" role="dialog" aria-modal="true" aria-labelledby="installment-details-title">
        <header className="transaction-entry-titlebar installment-entry-titlebar compact installment-details-titlebar">
          <span className="transaction-entry-icon"><Layers3 size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{copy("DETALHES DA COMPRA", "PURCHASE DETAILS")}</p>
            <h2 id="installment-details-title">{purchase.description}</h2>
            <div className="installment-details-heading-meta">
              <span>{purchase.paid_installments} {copy("de", "of")} {purchase.installment_count} {copy("parcelas pagas", "installments paid")}</span>
              <div className="installment-details-categories">
                {categoryList.length
                  ? categoryList.map((category) => (
                    <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>
                  ))
                  : <span className="category-badge uncategorized">{copy("Sem categoria", "Uncategorized")}</span>}
              </div>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-btn"
            type="button"
            onClick={onClose}
            disabled={Boolean(editingItem)}
            aria-label={copy("Fechar modal", "Close modal")}
            title={copy("Fechar", "Close")}
          >
            <X size={18} />
          </button>
        </header>

        <div className="installment-details-scroll">
          <section className="installment-financial-summary" aria-label={copy("Resumo financeiro", "Financial summary")}>
            <div><span>{copy("Valor da parcela", "Installment amount")}</span><strong>{formatMoney(purchase.installment_value)}</strong></div>
            <div><span>{copy("Total pago", "Paid total")}</span><strong>{formatMoney(purchase.paid_amount)}</strong></div>
            <div><span>{copy("Saldo restante", "Remaining balance")}</span><strong>{formatMoney(purchase.remaining_amount)}</strong></div>
          </section>

          <dl className="installment-purchase-meta">
            <div><dt>{copy("Valor total", "Total amount")}</dt><dd>{formatMoney(purchase.total_amount)}</dd></div>
            <div><dt>{copy("Parcelas", "Installments")}</dt><dd>{purchase.installment_count}</dd></div>
            <div><dt>{copy("Cartão ou fatura", "Card or invoice")}</dt><dd>{firstInvoice?.name || copy("Não disponível", "Unavailable")}</dd></div>
            {purchaseDate && <div><dt>{copy("Data da compra", "Purchase date")}</dt><dd>{purchaseDate}</dd></div>}
          </dl>

          {editingPurchase && (
            <section className="installment-purchase-editor">
              <div className="installment-purchase-field">
                <span>{copy("Categorias da compra", "Purchase categories")}</span>
                <div>
                  <CategorySelect className="compact" categories={categories} values={categoryIds} onChange={saveCategory} onCreate={onCreateCategory} />
                  {savingCategory && <Loader2 className="spin" size={15} />}
                </div>
              </div>
              <p>{copy("Para alterar valor, fatura ou status de uma parcela, use o botão de editar na lista.", "To change an installment amount, invoice, or status, use the edit button in the list.")}</p>
            </section>
          )}

          <section className="installment-items-section">
            <div className="installment-items-title">
              <div>
                <h3>{copy("Parcelas", "Installments")}</h3>
                <p>{copy("Valores, faturas e vencimentos da compra.", "Amounts, invoices, and due dates for this purchase.")}</p>
              </div>
              <span>{purchase.items.length}</span>
            </div>

            <div className="installment-details-table" role="table" aria-label={copy("Parcelas da compra", "Purchase installments")}>
              <div className="installment-details-table-head" role="row">
                <span role="columnheader">{copy("Parcela", "Installment")}</span>
                <span role="columnheader">{copy("Valor", "Amount")}</span>
                <span role="columnheader">{copy("Fatura", "Invoice")}</span>
                <span role="columnheader">{copy("Vencimento", "Due date")}</span>
                <span role="columnheader">{copy("Status", "Status")}</span>
                <span role="columnheader" className="sr-only">{copy("Ações", "Actions")}</span>
              </div>
              <div className="installment-details-list">
                {itemGroups.map((group) => (
                  <section className={`installment-details-group ${group.tone}`} key={group.id} aria-labelledby={`installment-group-${group.id}`}>
                    <header className="installment-details-group-head">
                      <span id={`installment-group-${group.id}`}><i aria-hidden="true" />{group.title}</span>
                      <small>{group.items.length}</small>
                      <strong>{formatMoney(group.total)}</strong>
                    </header>
                    <div className="installment-details-group-list">
                      {group.items.map(renderItem)}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        </div>

        <footer className="modal-actions installment-details-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={Boolean(editingItem)}>{copy("Fechar", "Close")}</button>
          <button
            className={`btn btn-ghost ${editingPurchase ? "active" : ""}`}
            type="button"
            disabled={Boolean(editingItem)}
            onClick={() => setEditingPurchase((current) => !current)}
          >
            <Pencil size={15} /> {editingPurchase ? copy("Concluir edição", "Done editing") : copy("Editar compra", "Edit purchase")}
          </button>
          <button className="btn btn-ghost danger-text" type="button" disabled={Boolean(editingItem)} onClick={() => onRequestDelete(purchase)}>
            <Trash2 size={15} /> {copy("Remover", "Remove")}
          </button>
        </footer>
      </div>

      {editingItem && (
        <EditInstallmentItemModal
          purchase={purchase}
          item={editingItem}
          invoices={invoices}
          allowOverdueInvoiceEdits={allowOverdueInvoiceEdits}
          onSave={(payload) => onSaveItem(editingItem.id, payload)}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
