import { useEffect, useMemo, useState } from "react";
import { Check, Layers3, Loader2, Pencil, Trash2, X } from "lucide-react";
import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { invoiceAcceptsNewCharges } from "../app/helpers.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

function itemStatus(item, invoice = item.invoice) {
  if (item.status === "refunded") return { label: "Reembolsada", tone: "refunded" };
  if (item.status === "canceled") return { label: "Cancelada", tone: "danger" };
  if (invoice?.paid) return { label: "Paga", tone: "paid" };
  if (!invoice) return { label: "Sem fatura", tone: "neutral" };
  if (invoice.due_date < new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)) return { label: "Atrasada", tone: "danger" };
  return { label: "Pendente", tone: "pending" };
}

function purchaseCategories(purchase) {
  return purchase.categories?.length ? purchase.categories : purchase.category ? [purchase.category] : [];
}

export default function InstallmentDetailsModal({ purchase, invoices, categories = [], onCreateCategory, allowOverdueInvoiceEdits = false, onClose, onRequestDelete, onSaveItem, onSaveCategory }) {
  const { language } = useI18n();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ amount: "", invoice_id: "", status: "pending" });
  const [savingId, setSavingId] = useState(null);
  const [categoryIds, setCategoryIds] = useState((purchase.category_ids?.length ? purchase.category_ids : purchase.category_id ? [purchase.category_id] : []).map(String));
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(Boolean(purchase.__startEditing));
  const invoicesById = useMemo(() => new Map(invoices.map((invoice) => [String(invoice.id), invoice])), [invoices]);
  const nextId = purchase.next_installment?.id;
  const categoryList = purchaseCategories(purchase);

  useEffect(() => {
    setCategoryIds((purchase.category_ids?.length ? purchase.category_ids : purchase.category_id ? [purchase.category_id] : []).map(String));
  }, [purchase.category_id, purchase.category_ids]);

  const saveCategory = async (value) => {
    const previous = categoryIds;
    setCategoryIds(value);
    setSavingCategory(true);
    try { await onSaveCategory(purchase.id, value); } catch { setCategoryIds(previous); } finally { setSavingCategory(false); }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setDraft({ amount: formatMoney(item.amount, language), invoice_id: item.invoice_id ? String(item.invoice_id) : "", status: item.status || "pending" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ amount: "", invoice_id: "", status: "pending" });
  };

  const saveEdit = async (item) => {
    const amount = parseTypedMoneyInput(draft.amount, language);
    if (amount <= 0) return;
    setSavingId(item.id);
    try {
      await onSaveItem(item.id, { amount, invoice_id: draft.status === "canceled" ? null : draft.invoice_id ? Number(draft.invoice_id) : null, status: draft.status || "pending" });
      cancelEdit();
    } finally { setSavingId(null); }
  };

  const firstInvoice = purchase.items?.find((item) => item.invoice)?.invoice;
  const purchaseDate = purchase.created_at ? formatDateShort(purchase.created_at.slice(0, 10), language) : null;

  return (
    <div className="modal-layer installment-details-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Fechar detalhes" />
      <div className="modal-card invoice-modal installment-details-modal" role="dialog" aria-modal="true" aria-labelledby="installment-details-title">
        <header className="transaction-entry-titlebar installment-entry-titlebar compact installment-details-titlebar">
          <span className="transaction-entry-icon"><Layers3 size={21} /></span>
          <div className="transaction-entry-heading">
            <p>DETALHES DA COMPRA</p>
            <h2 id="installment-details-title">{purchase.description}</h2>
            <div className="installment-details-heading-meta"><span>{purchase.paid_installments} de {purchase.installment_count} parcelas pagas</span><div className="installment-details-categories">{categoryList.length ? categoryList.map((category) => <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>) : <span className="category-badge uncategorized">Sem categoria</span>}</div></div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal" title="Fechar"><X size={18} /></button>
        </header>

        <div className="installment-details-scroll">
          <section className="installment-financial-summary" aria-label="Resumo financeiro">
            <div><span>Valor da parcela</span><strong>{formatMoney(purchase.installment_value)}</strong></div>
            <div><span>Total pago</span><strong>{formatMoney(purchase.paid_amount)}</strong></div>
            <div><span>Saldo restante</span><strong>{formatMoney(purchase.remaining_amount)}</strong></div>
          </section>

          <dl className="installment-purchase-meta">
            <div><dt>Valor total</dt><dd>{formatMoney(purchase.total_amount)}</dd></div>
            <div><dt>Parcelas</dt><dd>{purchase.installment_count}</dd></div>
            <div><dt>Cartão ou fatura</dt><dd>{firstInvoice?.name || "Não disponível"}</dd></div>
            {purchaseDate && <div><dt>Data da compra</dt><dd>{purchaseDate}</dd></div>}
          </dl>

          {editingPurchase && <section className="installment-purchase-editor">
            <label><span>Categorias da compra</span><div><CategorySelect className="compact" categories={categories} values={categoryIds} onChange={saveCategory} onCreate={onCreateCategory} />{savingCategory && <Loader2 className="spin" size={15} />}</div></label>
            <p>Os valores e destinos de cada parcela podem ser editados diretamente na lista abaixo.</p>
          </section>}

          <section className="installment-items-section">
            <div className="installment-items-title"><div><h3>Parcelas</h3><p>Confira valores, faturas e vencimentos.</p></div><span>{purchase.items.length}</span></div>
            <div className="installment-details-table" role="table" aria-label="Parcelas da compra">
              <div className="installment-details-table-head" role="row">
                <span role="columnheader">Parcela</span><span role="columnheader">Valor</span><span role="columnheader">Fatura</span><span role="columnheader">Vencimento</span><span role="columnheader">Status</span><span role="columnheader" className="sr-only">Ações</span>
              </div>
              <div className="installment-details-list">
                {purchase.items.map((item) => {
                  const isEditing = editingId === item.id;
                  const selectedInvoice = isEditing ? invoicesById.get(String(draft.invoice_id)) : item.invoice;
                  const status = itemStatus(item, selectedInvoice);
                  const invoiceOptions = [...invoices].filter((invoice) => invoiceAcceptsNewCharges(invoice, allowOverdueInvoiceEdits) || invoice.id === item.invoice_id).sort((a, b) => a.due_date.localeCompare(b.due_date));
                  const saveDisabled = savingId === item.id || parseTypedMoneyInput(draft.amount, language) <= 0 || (draft.status === "refunded" && !draft.invoice_id) || (draft.invoice_id && !selectedInvoice);
                  return (
                    <div className={`installment-details-item ${item.id === nextId ? "is-next" : ""}`} role="row" key={item.id}>
                      <span className="installment-item-number" role="cell"><small>Parcela</small><strong>{item.installment_number}/{purchase.installment_count}</strong>{item.id === nextId && <em>Próxima</em>}</span>
                      <span role="cell"><small>Valor</small>{isEditing ? <input inputMode="decimal" aria-label={`Valor da parcela ${item.installment_number}`} value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))} onBlur={() => setDraft((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))} /> : <strong>{formatMoney(item.amount)}</strong>}</span>
                      <span role="cell"><small>Fatura</small>{isEditing ? <select aria-label={`Fatura da parcela ${item.installment_number}`} value={draft.status === "canceled" ? "" : draft.invoice_id} onChange={(event) => setDraft((current) => ({ ...current, invoice_id: event.target.value }))} disabled={draft.status === "canceled"}><option value="">Sem fatura</option>{invoiceOptions.map((invoice) => <option value={invoice.id} key={invoice.id}>{invoice.name}</option>)}</select> : <span>{item.invoice?.name || "Fatura removida"}</span>}</span>
                      <span role="cell"><small>Vencimento</small><span>{selectedInvoice?.due_date ? formatDateShort(selectedInvoice.due_date, language) : "—"}</span></span>
                      <span role="cell"><small>Status</small>{isEditing ? <select aria-label={`Status da parcela ${item.installment_number}`} value={draft.status || "pending"} onChange={(event) => { const nextStatus = event.target.value; setDraft((current) => ({ ...current, status: nextStatus, invoice_id: nextStatus === "canceled" ? "" : current.invoice_id })); }}><option value="pending">Pendente</option><option value="refunded">Reembolsada</option><option value="canceled">Cancelada</option></select> : <span className={`installment-status ${status.tone}`}>{status.label}</span>}</span>
                      <span className="installment-row-actions" role="cell">{isEditing ? <><button className="icon-btn small" type="button" onClick={() => saveEdit(item)} disabled={saveDisabled} aria-label={`Salvar parcela ${item.installment_number}`} title="Salvar alterações"><Check size={15} /></button><button className="icon-btn small" type="button" onClick={cancelEdit} disabled={savingId === item.id} aria-label={`Cancelar edição da parcela ${item.installment_number}`} title="Cancelar edição"><X size={15} /></button></> : <button className="icon-btn small" type="button" onClick={() => startEdit(item)} aria-label={`Editar parcela ${item.installment_number}`} title="Editar valor, fatura ou status"><Pencil size={15} /></button>}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

        </div>

        <footer className="modal-actions installment-details-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
          <button className={`btn btn-ghost ${editingPurchase ? "active" : ""}`} type="button" onClick={() => setEditingPurchase((current) => !current)}><Pencil size={15} /> {editingPurchase ? "Concluir edição" : "Editar compra"}</button>
          <button className="btn btn-ghost danger-text" type="button" onClick={() => onRequestDelete(purchase)}><Trash2 size={15} /> Remover</button>
        </footer>
      </div>
    </div>
  );
}
