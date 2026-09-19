import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CircleDollarSign, CircleMinus, CreditCard, LayoutList, Pencil, Plus, Receipt, Search, Tag, Trash2, X } from "lucide-react";
import FilterSelect from "../components/common/FilterSelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { invoiceCategoryTotals, normalizeInvoiceColor } from "../app/helpers.js";
import { formatDateShort, formatMoney } from "../utils/format.js";

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function entryCategories(entry) {
  return entry.categories?.length ? entry.categories : entry.category ? [entry.category] : [];
}

export default function InvoiceItemsModal({ invoice, expenseOptions = [], canAddToInvoice = false, onAddEntry, onEditItem, onViewItem, onDeleteItem, onDeleteInstallmentItem, onManageReceivable, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const layerRef = useRef(null);
  const searchRef = useRef(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("amount_desc");
  const [grouped, setGrouped] = useState(false);
  const noCategoryLabel = copy("Sem categoria", "Uncategorized");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      const layers = [...document.querySelectorAll(".modal-layer")];
      if (layers[layers.length - 1] !== layerRef.current) return;
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(focusFrame);
  }, []);

  const entries = useMemo(() => [
    ...(invoice.items || []).map((item) => ({ key: `invoice-${item.id}`, context: "invoice", item, description: item.description, amount: Number(item.amount || 0), categories: entryCategories(item) })),
    ...(invoice.installment_items || []).map((item) => ({ key: `installment-${item.id}`, context: "installment", item, description: item.purchase_description || item.description, amount: Number(item.amount || 0), categories: entryCategories(item) })),
  ], [invoice]);

  const visibleEntries = useMemo(() => {
    const term = normalize(search.trim());
    const filtered = term
      ? entries.filter((entry) => normalize(entry.description).includes(term) || entry.categories.some((category) => normalize(category.name).includes(term)))
      : entries;
    return [...filtered].sort((left, right) => {
      if (sort === "amount_desc") return Math.abs(right.amount) - Math.abs(left.amount);
      if (sort === "amount_asc") return Math.abs(left.amount) - Math.abs(right.amount);
      if (sort === "name") return left.description.localeCompare(right.description, language);
      return String(right.item.created_at || "").localeCompare(String(left.item.created_at || "")) || Number(right.item.id) - Number(left.item.id);
    });
  }, [entries, language, search, sort]);

  const groups = useMemo(() => {
    if (!grouped) return [{ id: "all", name: null, color: null, entries: visibleEntries, total: visibleEntries.reduce((total, entry) => total + entry.amount, 0) }];
    const map = new Map();
    visibleEntries.forEach((entry) => {
      const category = entry.categories[0];
      const id = category ? String(category.id) : "none";
      if (!map.has(id)) map.set(id, { id, name: category?.name || null, color: category?.color || null, entries: [], total: 0 });
      const group = map.get(id);
      group.entries.push(entry);
      group.total += entry.amount;
    });
    return [...map.values()].sort((left, right) => right.total - left.total);
  }, [grouped, visibleEntries]);

  const categoryTotals = useMemo(() => invoiceCategoryTotals(invoice), [invoice]);
  const breakdownTotal = categoryTotals.reduce((total, entry) => total + entry.amount, 0);
  const visibleTotal = visibleEntries.reduce((total, entry) => total + entry.amount, 0);
  const searching = Boolean(search.trim());
  const sortOptions = [
    { value: "amount_desc", label: copy("Maior valor", "Highest amount") },
    { value: "amount_asc", label: copy("Menor valor", "Lowest amount") },
    { value: "recent", label: copy("Mais recentes", "Most recent") },
    { value: "name", label: copy("Descrição (A-Z)", "Description (A-Z)") },
  ];

  const renderRow = (entry) => {
    const refund = entry.context === "invoice" && entry.amount < 0;
    const item = entry.item;
    return (
      <div
        className={`invoice-items-row ${refund ? "refund" : ""}`}
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
              <em className="installment-badge" title={copy("Compra parcelada", "Installment purchase")}>
                <CreditCard size={11} />{item.installment_number}/{item.installment_count}
              </em>
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
              <button className="icon-btn small danger" type="button" onClick={(event) => { event.stopPropagation(); onDeleteItem?.(invoice.id, item.id); }} aria-label={copy("Remover item", "Remove item")} title={copy("Remover item", "Remove item")}>
                <Trash2 size={15} />
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn small" type="button" onClick={(event) => { event.stopPropagation(); onManageReceivable?.(expenseOptions.find((option) => option.source_type === "installment_item" && option.source_id === item.id)); }} aria-label={copy("Associar recebível", "Link receivable")} title={copy("Associar recebível", "Link receivable")}>
                <CircleDollarSign size={15} />
              </button>
              <button className="icon-btn small danger" type="button" onClick={(event) => { event.stopPropagation(); onDeleteInstallmentItem?.(item.id); }} aria-label={copy("Remover parcela", "Remove installment")} title={copy("Remover parcela", "Remove installment")}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  return (
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

        {categoryTotals.length > 1 && (
          <div className="invoice-items-breakdown" aria-label={copy("Gastos por categoria", "Spending by category")}>
            {categoryTotals.slice(0, 5).map((entry) => (
              <div className="invoice-items-breakdown-item" style={{ "--category-color": entry.color || "var(--muted)" }} key={entry.id}>
                <span>{entry.name || noCategoryLabel}</span>
                <strong>{formatMoney(entry.amount)}</strong>
                <i><b style={{ width: `${breakdownTotal ? Math.max((entry.amount / breakdownTotal) * 100, 2) : 0}%` }} /></i>
              </div>
            ))}
          </div>
        )}

        <div className="invoice-items-scroll">
          {searching && (
            <p className="invoice-items-result-count">
              {visibleEntries.length} {visibleEntries.length === 1 ? copy("resultado", "result") : copy("resultados", "results")} · {formatMoney(visibleTotal)}
            </p>
          )}
          {visibleEntries.length ? groups.map((group) => (
            <section className="invoice-items-group" key={group.id}>
              {grouped && (
                <header className="invoice-items-group-head" style={{ "--category-color": group.color || "var(--muted)" }}>
                  <span><i />{group.name || noCategoryLabel}</span>
                  <small>{group.entries.length}</small>
                  <strong>{formatMoney(group.total)}</strong>
                </header>
              )}
              <div className="invoice-items-list">{group.entries.map(renderRow)}</div>
            </section>
          )) : (
            <p className="invoice-items-empty">{copy("Nenhum item encontrado para essa busca.", "No items match this search.")}</p>
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
    </div>
  );
}
