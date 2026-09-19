import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, CircleDollarSign, CircleMinus, CreditCard, LayoutList, Pencil, Plus, Receipt, Search, Tag, Trash2, X } from "lucide-react";
import FilterSelect from "../components/common/FilterSelect.jsx";
import DeleteInvoiceEntryModal from "./DeleteInvoiceEntryModal.jsx";
import { useI18n } from "../i18n/index.ts";
import { MOBILE_MEDIA_QUERY } from "../app/constants.js";
import { categoryCombination, entryCategories, invoiceCategoryTotals, isMobileViewport, normalizeInvoiceColor } from "../app/helpers.js";
import { formatDateShort, formatMoney } from "../utils/format.js";

const BREAKDOWN_PREVIEW = 5;

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function installmentRowStatus(item, invoicePaid, copy) {
  if (item.status === "refunded") return { label: copy("Reembolsada", "Refunded"), tone: "refunded" };
  if (item.status === "canceled") return { label: copy("Cancelada", "Canceled"), tone: "danger" };
  if (invoicePaid) return { label: copy("Paga", "Paid"), tone: "paid" };
  return { label: copy("Pendente", "Pending"), tone: "pending" };
}

export default function InvoiceItemsModal({ invoice, expenseOptions = [], canAddToInvoice = false, onAddEntry, onEditItem, onViewItem, onDeleteItem, onDeleteInstallmentItem, onManageReceivable, onViewInstallment, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const layerRef = useRef(null);
  const searchRef = useRef(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [grouped, setGrouped] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  // No mobile o resumo por categoria nasce recolhido para sobrar espaço aos itens.
  const [compactBreakdown, setCompactBreakdown] = useState(isMobileViewport);
  const [breakdownOpen, setBreakdownOpen] = useState(() => !isMobileViewport());
  const [entryToDelete, setEntryToDelete] = useState(null);
  const noCategoryLabel = copy("Sem categoria", "Uncategorized");

  useEffect(() => {
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    const sync = (event) => {
      setCompactBreakdown(event.matches);
      setBreakdownOpen(!event.matches);
    };
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // Scroll lock fica no AppShell (position:fixed); overflow:hidden aqui esvazia a tela.
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      const layers = [...document.querySelectorAll(".modal-layer")];
      if (layers[layers.length - 1] !== layerRef.current) return;
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (isMobileViewport()) return undefined;
    const focusFrame = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(focusFrame);
  }, []);

  const entries = useMemo(() => [
    ...(invoice.items || []).map((item) => ({ key: `invoice-${item.id}`, context: "invoice", item, description: item.description, amount: Number(item.amount || 0), categories: entryCategories(item) })),
    ...(invoice.installment_items || []).map((item) => ({ key: `installment-${item.id}`, context: "installment", item, description: item.purchase_description || item.description, amount: Number(item.amount || 0), categories: entryCategories(item) })),
  ], [invoice]);

  const visibleEntries = useMemo(() => {
    const term = normalize(search.trim());
    const filtered = entries.filter((entry) => {
      if (categoryFilter && categoryCombination(entry.categories).id !== categoryFilter) return false;
      if (!term) return true;
      return normalize(entry.description).includes(term) || entry.categories.some((category) => normalize(category.name).includes(term));
    });
    const byRegistration = (left, right) => (
      String(left.item.created_at || "").localeCompare(String(right.item.created_at || ""))
      || Number(left.item.id) - Number(right.item.id)
    );
    return [...filtered].sort((left, right) => {
      if (sort === "amount_desc") return Math.abs(right.amount) - Math.abs(left.amount);
      if (sort === "amount_asc") return Math.abs(left.amount) - Math.abs(right.amount);
      if (sort === "name") return left.description.localeCompare(right.description, language);
      if (sort === "recent") return byRegistration(right, left);
      return byRegistration(left, right);
    });
  }, [categoryFilter, entries, language, search, sort]);

  const groups = useMemo(() => {
    if (!grouped) return [{ id: "all", name: null, color: null, entries: visibleEntries, total: visibleEntries.reduce((total, entry) => total + entry.amount, 0) }];
    const map = new Map();
    visibleEntries.forEach((entry) => {
      const combination = categoryCombination(entry.categories);
      if (!map.has(combination.id)) map.set(combination.id, { ...combination, entries: [], total: 0 });
      const group = map.get(combination.id);
      group.entries.push(entry);
      group.total += entry.amount;
    });
    return [...map.values()].sort((left, right) => right.total - left.total);
  }, [grouped, visibleEntries]);

  const categoryTotals = useMemo(() => invoiceCategoryTotals(invoice), [invoice]);
  const breakdownTotal = categoryTotals.reduce((total, entry) => total + entry.amount, 0);
  const visibleTotal = visibleEntries.reduce((total, entry) => total + entry.amount, 0);
  const searching = Boolean(search.trim());
  const showToolbar = entries.length > 4;
  const showBreakdown = showToolbar && categoryTotals.length > 1;
  const collapsedCategories = categoryTotals.slice(0, BREAKDOWN_PREVIEW);
  const hiddenCategories = categoryTotals.length - collapsedCategories.length;
  const visibleCategories = allCategoriesOpen ? categoryTotals : collapsedCategories;
  const activeCategory = categoryTotals.find((entry) => entry.id === categoryFilter) || null;
  const sortOptions = [
    { value: "oldest", label: copy("Mais antigos", "Oldest first") },
    { value: "recent", label: copy("Mais recentes", "Newest first") },
    { value: "amount_desc", label: copy("Maior valor", "Highest amount") },
    { value: "amount_asc", label: copy("Menor valor", "Lowest amount") },
    { value: "name", label: copy("Descrição (A-Z)", "Description (A-Z)") },
  ];

  const renderRow = (entry) => {
    const refund = entry.context === "invoice" && entry.amount < 0;
    const item = entry.item;
    const installmentStatus = entry.context === "installment"
      ? installmentRowStatus(item, invoice.paid, copy)
      : null;
    return (
      <div
        className={`invoice-items-row ${refund ? "refund" : ""} ${entry.context === "installment" ? "is-installment" : ""}`}
        role="button"
        tabIndex="0"
        onClick={() => onViewItem?.(invoice, item, entry.context)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onViewItem?.(invoice, item, entry.context);
          }
        }}
        aria-label={`${copy("Ver detalhes de", "View details for")} ${entry.description}`}
        key={entry.key}
      >
        <span className="invoice-items-row-main">
          <span className="invoice-items-row-title">
            {refund && <em className="refund-badge">{copy("Reembolso", "Refund")}</em>}
            {entry.context === "installment" && (
              <span className="invoice-items-row-installment-meta">
                {onViewInstallment ? (
                  <button
                    className="installment-badge"
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onViewInstallment(item.purchase_id); }}
                    title={copy("Ver compra parcelada", "View installment purchase")}
                    aria-label={copy(`Parcela ${item.installment_number} de ${item.installment_count}`, `Installment ${item.installment_number} of ${item.installment_count}`)}
                  >
                    <CreditCard size={11} />{item.installment_number}/{item.installment_count}
                  </button>
                ) : (
                  <em className="installment-badge" title={copy("Compra parcelada", "Installment purchase")}>
                    <CreditCard size={11} />{item.installment_number}/{item.installment_count}
                  </em>
                )}
                {installmentStatus && (
                  <span className={`installment-status ${installmentStatus.tone}`}>{installmentStatus.label}</span>
                )}
              </span>
            )}
            <strong>{entry.description}</strong>
          </span>
          <span className="invoice-items-row-tags">
            {entry.categories.length ? entry.categories.map((category) => (
              <span className="category-badge" style={{ "--category-color": category.color || "var(--muted)" }} key={category.id}>
                <Tag size={11} />{category.name}
              </span>
            )) : <span className="category-badge uncategorized">{noCategoryLabel}</span>}
          </span>
        </span>
        <strong className="invoice-items-row-amount">{formatMoney(entry.amount)}</strong>
        <span className="invoice-items-row-actions">
          {entry.context === "invoice" ? (
            <>
              <button className="icon-btn small" type="button" onClick={(event) => { event.stopPropagation(); onEditItem?.(invoice, item); }} aria-label={copy("Editar item", "Edit item")} title={copy("Editar item", "Edit item")}>
                <Pencil size={15} />
              </button>
              <button className="icon-btn small danger" type="button" onClick={(event) => { event.stopPropagation(); setEntryToDelete(entry); }} aria-label={copy("Remover item", "Remove item")} title={copy("Remover item", "Remove item")}>
                <Trash2 size={15} />
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn small" type="button" onClick={(event) => { event.stopPropagation(); onManageReceivable?.(expenseOptions.find((option) => option.source_type === "installment_item" && option.source_id === item.id)); }} aria-label={copy("Associar recebível", "Link receivable")} title={copy("Associar recebível", "Link receivable")}>
                <CircleDollarSign size={15} />
              </button>
              <button className="icon-btn small danger" type="button" onClick={(event) => { event.stopPropagation(); setEntryToDelete(entry); }} aria-label={copy("Remover parcela", "Remove installment")} title={copy("Remover parcela", "Remove installment")}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  return createPortal(
    <div className="modal-layer invoice-items-layer" ref={layerRef}>
      <button className="modal-backdrop" onClick={onClose} aria-label={copy("Fechar itens da fatura", "Close invoice items")} />
      <section className="modal-card invoice-items-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-items-title" style={{ "--invoice-color": normalizeInvoiceColor(invoice.color) }}>
        <header className="invoice-items-head">
          <span className="invoice-items-icon"><Receipt size={20} /></span>
          <div className="invoice-items-heading">
            <p>{copy("Itens da fatura", "Invoice items")}</p>
            <h2 id="invoice-items-title">{invoice.name}</h2>
            <div className="invoice-items-heading-meta">
              <span><CalendarDays size={12} />{copy("Vence", "Due")} {formatDateShort(invoice.due_date)}</span>
              <span>{entries.length} {entries.length === 1 ? copy("item", "item") : copy("itens", "items")}</span>
              <strong>{formatMoney(invoice.total_amount)}</strong>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={copy("Fechar", "Close")} title={copy("Fechar", "Close")}><X size={18} /></button>
        </header>

        {showToolbar && (
          <div className="invoice-items-toolbar">
            <label className="invoice-items-search">
              <Search size={15} />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={copy("Buscar por descrição ou categoria", "Search by description or category")}
                aria-label={copy("Buscar itens", "Search items")}
              />
            </label>
            <FilterSelect value={sort} options={sortOptions} onChange={setSort} ariaLabel={copy("Ordenar itens", "Sort items")} />
            <button
              className={`btn btn-ghost invoice-items-group-toggle ${grouped ? "active" : ""}`}
              type="button"
              onClick={() => setGrouped((current) => !current)}
              aria-pressed={grouped}
            >
              <LayoutList size={15} />{copy("Agrupar por categoria", "Group by category")}
            </button>
          </div>
        )}

        {showBreakdown && (
          <div className={`invoice-items-breakdown ${breakdownOpen ? "" : "collapsed"}`} aria-label={copy("Gastos por categoria", "Spending by category")}>
            {compactBreakdown && (
              <button
                className={`invoice-items-breakdown-toggle ${breakdownOpen ? "open" : ""}`}
                type="button"
                onClick={() => setBreakdownOpen((current) => !current)}
                aria-expanded={breakdownOpen}
              >
                <Tag size={13} />
                <span>{copy("Gastos por categoria", "Spending by category")}</span>
                <em>{categoryTotals.length}</em>
                <ChevronDown size={15} />
              </button>
            )}
            {breakdownOpen && (
              <div className="invoice-items-breakdown-grid">
                {visibleCategories.map((entry) => {
                  const label = entry.name || noCategoryLabel;
                  const selected = categoryFilter === entry.id;
                  return (
                    <button
                      className={`invoice-items-breakdown-item ${selected ? "active" : ""}`}
                      style={{ "--category-color": entry.color || "var(--muted)" }}
                      type="button"
                      onClick={() => setCategoryFilter(selected ? null : entry.id)}
                      aria-pressed={selected}
                      title={copy(`Filtrar por ${label}`, `Filter by ${label}`)}
                      key={entry.id}
                    >
                      <span>{label}</span>
                      <strong>{formatMoney(entry.amount)}</strong>
                      <i><b style={{ width: `${breakdownTotal ? Math.max((entry.amount / breakdownTotal) * 100, 2) : 0}%` }} /></i>
                    </button>
                  );
                })}
              </div>
            )}
            {breakdownOpen && hiddenCategories > 0 && (
              <button
                className="invoice-items-breakdown-more"
                type="button"
                onClick={() => setAllCategoriesOpen((current) => !current)}
                aria-expanded={allCategoriesOpen}
              >
                {allCategoriesOpen
                  ? copy("Mostrar menos", "Show less")
                  : copy(`Ver todas as ${categoryTotals.length} categorias`, `View all ${categoryTotals.length} categories`)}
              </button>
            )}
          </div>
        )}

        <div className="invoice-items-scroll">
          {(searching || activeCategory) && (
            <p className="invoice-items-result-count">
              <span>
                {visibleEntries.length} {visibleEntries.length === 1 ? copy("resultado", "result") : copy("resultados", "results")} · {formatMoney(visibleTotal)}
              </span>
              {activeCategory && (
                <button type="button" onClick={() => setCategoryFilter(null)}>
                  <X size={11} />{activeCategory.name || noCategoryLabel}
                </button>
              )}
            </p>
          )}
          {visibleEntries.length ? groups.map((group) => (
            <section className="invoice-items-group" key={group.id}>
              {grouped && (
                <header className="invoice-items-group-head" style={{ "--category-color": group.color || "var(--muted)" }}>
                  <span title={group.name || noCategoryLabel}><i />{group.name || noCategoryLabel}</span>
                  <small>{group.entries.length}</small>
                  <strong>{formatMoney(group.total)}</strong>
                </header>
              )}
              <div className="invoice-items-list">{group.entries.map(renderRow)}</div>
            </section>
          )) : (
            <p className="invoice-items-empty">{copy("Nenhum item encontrado com esses filtros.", "No items match these filters.")}</p>
          )}
        </div>

        <footer className="modal-actions invoice-items-actions">
          {canAddToInvoice && (
            <>
              <button className="btn btn-ghost" type="button" onClick={() => onAddEntry?.(invoice, "expense")}>
                <Plus size={15} />{copy("Adicionar item", "Add item")}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => onAddEntry?.(invoice, "refund")}>
                <CircleMinus size={15} />{copy("Adicionar reembolso", "Add refund")}
              </button>
            </>
          )}
          <button className="btn btn-primary" type="button" onClick={onClose}>{copy("Fechar", "Close")}</button>
        </footer>
      </section>
      {entryToDelete && (
        <DeleteInvoiceEntryModal
          entry={entryToDelete}
          onConfirm={async () => {
            if (entryToDelete.context === "installment") await onDeleteInstallmentItem?.(entryToDelete.item.id);
            else await onDeleteItem?.(invoice.id, entryToDelete.item.id);
            setEntryToDelete(null);
          }}
          onClose={() => setEntryToDelete(null)}
        />
      )}
    </div>,
    document.body,
  );
}
