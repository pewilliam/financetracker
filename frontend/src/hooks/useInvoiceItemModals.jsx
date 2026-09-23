import { useEffect, useMemo, useState } from "react";
import InvoiceEntryModal from "../modals/InvoiceEntryModal.jsx";
import InvoiceItemModal from "../modals/InvoiceItemModal.jsx";
import InvoiceItemsModal from "../modals/InvoiceItemsModal.jsx";
import InvoiceDueDateModal from "../modals/InvoiceDueDateModal.jsx";
import DeleteInvoiceModal from "../modals/DeleteInvoiceModal.jsx";
import EntryDetailsModal from "../modals/EntryDetailsModal.jsx";
import InstallmentModal from "../modals/InstallmentModal.jsx";
import { useI18n } from "../i18n/index.ts";
import { defaultInstallmentForm, invoiceAcceptsNewCharges, yearMonthKey } from "../app/helpers.js";
import { buildUnifiedExpenseInsight } from "../utils/categoryInsights.js";

// Shared state + UI for the invoice items modal and every modal reachable from
// it (add entry, batch installment, edit item, view item details). Used by both
// the invoices page and the app shell so the items modal can be opened in place
// from anywhere (e.g. the monthly control screen) without navigating away.
export function useInvoiceItemModals({
  invoices = [],
  categories = [],
  cards = [],
  expenseOptions = [],
  allowOverdueInvoiceEdits = false,
  addItem,
  addPurchase,
  updateItem,
  updateDueDate,
  createInstallment,
  deleteItem,
  deleteInstallmentItem,
  deleteInvoice,
  onManageReceivable,
  onCreateCategory,
  onLoadCategoryDetails,
  onLoadInvoiceItems,
  onEnsureExpenseContext,
  onViewInstallment,
}) {
  const { language } = useI18n();
  const [editingItem, setEditingItem] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const [creatingEntry, setCreatingEntry] = useState(null);
  const [itemsInvoiceId, setItemsInvoiceId] = useState(null);
  const [dueDateInvoiceId, setDueDateInvoiceId] = useState(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState(null);
  const [installmentForm, setInstallmentForm] = useState(defaultInstallmentForm);

  const findInvoice = (invoiceId) => invoiceId === null ? null : invoices.find((invoice) => invoice.id === invoiceId) || null;
  const itemsInvoice = findInvoice(itemsInvoiceId);
  const dueDateInvoice = findInvoice(dueDateInvoiceId);
  const deletingInvoice = findInvoice(deletingInvoiceId);
  const overlayOpen = Boolean(creatingEntry || editingItem || viewingItem || itemsInvoice || dueDateInvoice || deletingInvoice);

  useEffect(() => {
    if (itemsInvoice?.items_included === false) onLoadInvoiceItems?.([itemsInvoice.id]);
  }, [itemsInvoice, onLoadInvoiceItems]);

  useEffect(() => {
    if (!viewingItem?.invoice) return;
    const monthKey = yearMonthKey(viewingItem.invoice.due_date);
    const ids = invoices
      .filter((invoice) => invoice.items_included === false && yearMonthKey(invoice.due_date) === monthKey)
      .map((invoice) => invoice.id);
    if (ids.length) onLoadInvoiceItems?.(ids);
  }, [invoices, onLoadInvoiceItems, viewingItem]);

  useEffect(() => {
    if (creatingEntry || editingItem || viewingItem || itemsInvoice) onEnsureExpenseContext?.();
  }, [creatingEntry, editingItem, itemsInvoice, viewingItem]);

  const saveEditedItem = async (payload) => {
    if (!editingItem) return;
    await updateItem(editingItem.invoice.id, editingItem.item.id, payload);
    setEditingItem(null);
  };

  const saveNewEntry = async (payload) => {
    if (!creatingEntry) return;
    if (creatingEntry.kind === "refund") await addItem(creatingEntry.invoice.id, payload);
    else await addPurchase(payload.credit_card_id, payload);
    setCreatingEntry(null);
  };

  const saveNewInstallment = async (payload) => {
    const created = await createInstallment(payload);
    if (created === false) return;
    setCreatingEntry(null);
    setInstallmentForm(defaultInstallmentForm());
  };

  const openItems = (invoice) => {
    if (!invoice?.id) return;
    setCreatingEntry(null);
    setEditingItem(null);
    setViewingItem(null);
    setItemsInvoiceId(invoice.id);
  };

  const closeItems = () => setItemsInvoiceId(null);

  const openEntry = (invoice, kind) => {
    setEditingItem(null);
    setViewingItem(null);
    setInstallmentForm(defaultInstallmentForm(invoice?.credit_card_id || ""));
    setCreatingEntry({ invoice, kind, entryMode: "single", cardId: String(invoice?.credit_card_id || "") });
  };

  const setEntryMode = (entryMode) => {
    setCreatingEntry((current) => current ? { ...current, entryMode } : current);
  };

  const openPurchase = (cardId = "") => {
    setEditingItem(null);
    setViewingItem(null);
    setInstallmentForm(defaultInstallmentForm(cardId));
    setCreatingEntry({ invoice: null, kind: "expense", entryMode: "single", cardId: cardId ? String(cardId) : "" });
  };

  const closeEntryModal = () => {
    setCreatingEntry(null);
    setInstallmentForm(defaultInstallmentForm());
  };

  const openEditDueDate = (invoice) => setDueDateInvoiceId(invoice.id);
  const openDelete = (invoice) => setDeletingInvoiceId(invoice.id);

  const manageReceivable = (option) => {
    setEditingItem(null);
    setViewingItem(null);
    onManageReceivable?.(option);
  };

  const invoiceItemInsight = ({ invoice: targetInvoice, item: targetItem, context }) => {
    const targetCategories = targetItem.categories?.length ? targetItem.categories : targetItem.category ? [targetItem.category] : [];
    const category = targetCategories[0];
    if (!category) return null;
    const targetIsRefund = context === "invoice" && Number(targetItem.amount) < 0;
    if (!targetIsRefund) {
      return buildUnifiedExpenseInsight(expenseOptions, {
        sourceType: context === "installment" ? "installment_item" : "invoice_item",
        sourceId: targetItem.id,
        date: targetInvoice.due_date,
        amount: targetItem.amount,
      }, category, language);
    }
    const monthEntries = invoices
      .filter((invoice) => yearMonthKey(invoice.due_date) === yearMonthKey(targetInvoice.due_date))
      .flatMap((invoice) => [
        ...(invoice.items || []).map((item) => ({ ...item, invoice, context: "invoice" })),
        ...(invoice.installment_items || []).map((item) => ({ ...item, invoice, context: "installment" })),
      ])
      .filter((entry) => {
        const entryCategories = entry.categories?.length ? entry.categories : entry.category ? [entry.category] : [];
        const isRefund = entry.context === "invoice" && Number(entry.amount) < 0;
        return isRefund === targetIsRefund && entryCategories.some((item) => item.id === category.id);
      })
      .sort((left, right) => String(left.invoice.due_date).localeCompare(String(right.invoice.due_date))
        || String(left.created_at || "").localeCompare(String(right.created_at || ""))
        || Number(left.id) - Number(right.id));
    const position = monthEntries.findIndex((entry) => entry.id === targetItem.id && entry.context === context && entry.invoice.id === targetInvoice.id) + 1;
    const categoryTotal = monthEntries.reduce((total, entry) => total + Math.abs(Number(entry.amount || 0)), 0);
    const share = categoryTotal ? Math.min((Math.abs(Number(targetItem.amount || 0)) / categoryTotal) * 100, 100) : 0;
    const kind = targetIsRefund
      ? (language === "en-US" ? "refund" : "reembolso")
      : (language === "en-US" ? "expense" : "gasto");
    return {
      label: language === "en-US"
        ? `#${position} ${kind} in ${category.name} across this month's invoices`
        : `${position}º ${kind} em ${category.name} nas faturas deste mês`,
      share,
      shareLabel: language === "en-US"
        ? `${share.toLocaleString(language, { maximumFractionDigits: 1 })}% of the invoiced category total`
        : `${share.toLocaleString(language, { maximumFractionDigits: 1 })}% do total da categoria nas faturas`,
    };
  };

  const viewingInsight = useMemo(
    () => viewingItem ? invoiceItemInsight(viewingItem) : null,
    [expenseOptions, invoices, language, viewingItem],
  );

  const element = (
    <>
      {itemsInvoice && (
        <InvoiceItemsModal
          invoice={itemsInvoice}
          expenseOptions={expenseOptions}
          canAddToInvoice={invoiceAcceptsNewCharges(itemsInvoice, allowOverdueInvoiceEdits)}
          onAddEntry={openEntry}
          onEditItem={(targetInvoice, item) => setEditingItem({ invoice: targetInvoice, item })}
          onViewItem={(targetInvoice, item, context) => setViewingItem({ invoice: targetInvoice, item, context })}
          onDeleteItem={deleteItem}
          onDeleteInstallmentItem={deleteInstallmentItem}
          onManageReceivable={manageReceivable}
          onViewInstallment={onViewInstallment}
          onClose={closeItems}
        />
      )}
      {dueDateInvoice && (
        <InvoiceDueDateModal
          invoice={dueDateInvoice}
          onSave={async (dueDate) => {
            await updateDueDate(dueDateInvoice.id, dueDate);
            setDueDateInvoiceId(null);
          }}
          onClose={() => setDueDateInvoiceId(null)}
        />
      )}
      {deletingInvoice && (
        <DeleteInvoiceModal
          invoice={deletingInvoice}
          onConfirm={async () => {
            await deleteInvoice(deletingInvoice.id);
            setDeletingInvoiceId(null);
          }}
          onClose={() => setDeletingInvoiceId(null)}
        />
      )}
      {creatingEntry?.entryMode === "single" && (
        <InvoiceEntryModal
          kind={creatingEntry.kind}
          invoice={creatingEntry.invoice}
          cards={cards}
          cardId={creatingEntry.cardId}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onOpenInstallment={creatingEntry.kind === "expense" ? () => setEntryMode("batch") : undefined}
          onSave={saveNewEntry}
          onClose={closeEntryModal}
        />
      )}
      {creatingEntry?.entryMode === "batch" && (
        <InstallmentModal
          form={installmentForm}
          setForm={setInstallmentForm}
          cards={cards}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onOpenSingle={() => setEntryMode("single")}
          onSubmit={saveNewInstallment}
          onClose={closeEntryModal}
        />
      )}
      {editingItem && (
        <InvoiceItemModal
          invoice={editingItem.invoice}
          item={editingItem.item}
          categories={categories}
          expenseOption={expenseOptions.find((option) => option.source_type === "invoice_item" && option.source_id === editingItem.item.id)}
          onManageReceivable={manageReceivable}
          onCreateCategory={onCreateCategory}
          onSave={saveEditedItem}
          onClose={() => setEditingItem(null)}
        />
      )}
      {viewingItem && (
        <EntryDetailsModal
          item={viewingItem.item}
          context={viewingItem.context}
          invoice={viewingItem.invoice}
          insight={viewingInsight}
          onLoadCategoryDetails={onLoadCategoryDetails}
          onClose={() => setViewingItem(null)}
          onEdit={viewingItem.context === "invoice" ? () => {
            const target = viewingItem;
            setViewingItem(null);
            setEditingItem({ invoice: target.invoice, item: target.item });
          } : undefined}
          onViewInstallment={viewingItem.context === "installment" ? (purchaseId) => {
            setViewingItem(null);
            onViewInstallment?.(purchaseId);
          } : undefined}
        />
      )}
    </>
  );

  return { openItems, closeItems, openEntry, openPurchase, openEditDueDate, openDelete, itemsInvoiceId, overlayOpen, element };
}
