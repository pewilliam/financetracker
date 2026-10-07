import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Filter, Plus, Search, X } from "lucide-react";
import { toast } from "react-hot-toast";
import InvoiceCard from "../components/InvoiceCard.jsx";
import { useI18n } from "../i18n/index.ts";
import { useInvoiceItemModals } from "../hooks/useInvoiceItemModals.jsx";
import { normalizeInvoiceColor, yearMonthKey } from "../app/helpers.js";
import { formatMoney, formatMonthLabel } from "../utils/format.js";

export function groupInvoicesByMonth(invoices, language = "pt-BR") {
  const groups = new Map();
  invoices.forEach((invoice) => {
    const monthKey = yearMonthKey(invoice.due_date);
    if (!groups.has(monthKey)) groups.set(monthKey, []);
    groups.get(monthKey).push(invoice);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthKey, items]) => {
      const [year, month] = monthKey.split("-").map(Number);
      const label = formatMonthLabel(year, month, language);
      return {
        id: monthKey,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        items: [...items].sort((left, right) => String(left.due_date).localeCompare(String(right.due_date))),
      };
    });
}

export default function InvoicesPage({ invoices, cards = [], categories = [], expenseOptions = [], onManageReceivable, onCreateCategory, onLoadCategoryDetails, onLoadInvoiceItems, onEnsureExpenseContext, onOverlayChange, allowOverdueInvoiceEdits = false, addItem, addPurchase, updateItem, updateDueDate, createInstallment, deleteItem, deleteInstallmentItem, togglePaid, deleteInvoice, onViewInstallment, onCancelSubscription }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: "", status: "all", color: "all" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedMonthGroups, setExpandedMonthGroups] = useState({});
  const openedInitialGroup = useRef(false);
  const invoiceModals = useInvoiceItemModals({
    invoices,
    categories,
    cards,
    expenseOptions,
    allowOverdueInvoiceEdits,
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
    onCancelSubscription,
  });
  const invoiceColors = [...new Set(invoices.map((invoice) => normalizeInvoiceColor(invoice.color)))];
  const statusOptions = [
    { value: "all", label: tt("invoices.all", "Todas") },
    { value: "open", label: tt("invoices.pending", "Pendentes") },
    { value: "paid", label: tt("invoices.paid", "Pagas") },
  ];

  useEffect(() => {
    onOverlayChange?.(invoiceModals.overlayOpen);
    return () => onOverlayChange?.(false);
  }, [invoiceModals.overlayOpen, onOverlayChange]);

  useEffect(() => {
    const invoiceId = Number(location.state?.openInvoiceItemsId);
    if (!invoiceId) return;
    const target = invoices.find((invoice) => Number(invoice.id) === invoiceId);
    if (target) {
      invoiceModals.openItems(target);
      navigate("/faturas", { replace: true, state: {} });
      return;
    }
    if (invoices.length) toast.error(language === "en-US" ? "Invoice not found." : "Fatura não encontrada.");
  }, [invoices, language, location.state?.openInvoiceItemsId]);

  useEffect(() => {
    const cardId = Number(location.state?.addPurchaseCardId);
    if (!cardId) return;
    invoiceModals.openPurchase(cardId);
    navigate("/faturas", { replace: true, state: {} });
  }, [location.state?.addPurchaseCardId]);

  const filteredInvoices = invoices.filter((invoice) => {
    const search = filters.search.trim().toLowerCase();
    const [year, month] = yearMonthKey(invoice.due_date).split("-").map(Number);
    const monthLabel = year && month ? formatMonthLabel(year, month, language) : "";
    const matchesSearch = !search || `${invoice.name} ${invoice.due_date} ${monthLabel}`.toLowerCase().includes(search);
    const invoiceStatus = invoice.paid ? "paid" : "open";
    const matchesStatus = filters.status === "all" || filters.status === invoiceStatus;
    const matchesColor = filters.color === "all" || normalizeInvoiceColor(invoice.color) === filters.color;
    return matchesSearch && matchesStatus && matchesColor;
  });

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDateValue = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthDateValue.getFullYear()}-${String(nextMonthDateValue.getMonth() + 1).padStart(2, "0")}`;

  const openInvoices = filteredInvoices.filter((invoice) => !invoice.paid);
  const paidInvoices = filteredInvoices
    .filter((invoice) => invoice.paid)
    .sort((left, right) => String(right.due_date).localeCompare(String(left.due_date)));
  const currentMonthInvoices = openInvoices.filter((invoice) => yearMonthKey(invoice.due_date) === currentMonthKey);
  const nextMonthInvoices = openInvoices.filter((invoice) => yearMonthKey(invoice.due_date) === nextMonthKey);
  const otherInvoices = openInvoices.filter((invoice) => {
    const key = yearMonthKey(invoice.due_date);
    return key !== currentMonthKey && key !== nextMonthKey;
  });
  const otherInvoiceMonthGroups = groupInvoicesByMonth(otherInvoices, language);
  const firstOtherInvoiceMonthId = otherInvoiceMonthGroups[0]?.id;
  const activeFilterCount = Number(Boolean(filters.search.trim())) + Number(filters.status !== "all") + Number(filters.color !== "all");
  const hasActiveFilters = activeFilterCount > 0;
  const invoiceGroups = [
    { id: "current", label: tt("invoices.currentMonth", "Vencem este mês"), items: currentMonthInvoices, empty: tt("invoices.currentMonthEmpty", "Sem faturas que vencem este mês.") },
    { id: "next", label: tt("invoices.nextMonth", "Vencem no próximo mês"), items: nextMonthInvoices, empty: tt("invoices.nextMonthEmpty", "Sem faturas que vencem no próximo mês.") },
    { id: "other", label: tt("invoices.otherInvoices", "Demais faturas"), items: otherInvoices, empty: tt("invoices.otherInvoicesEmpty", "Sem demais faturas.") },
    { id: "paid", label: tt("invoices.paidInvoices", "Faturas pagas"), items: paidInvoices, empty: tt("invoices.paidInvoicesEmpty", "Sem faturas pagas.") }
  ].filter((group) => group.id !== "other" || group.items.length > 0);

  useEffect(() => {
    if (openedInitialGroup.current || invoices.length === 0) return;
    const firstWithItems = invoiceGroups.find((group) => group.items.length > 0);
    const next = {};
    invoiceGroups.forEach((group) => {
      next[group.id] = group.id === firstWithItems?.id;
    });
    openedInitialGroup.current = true;
    setExpandedGroups(next);
  }, [invoices.length, currentMonthInvoices.length, nextMonthInvoices.length, otherInvoices.length, paidInvoices.length]);

  useEffect(() => {
    if (!otherInvoiceMonthGroups.length) return;
    setExpandedMonthGroups((current) => (
      Object.keys(current).length ? current : { [firstOtherInvoiceMonthId]: true }
    ));
  }, [firstOtherInvoiceMonthId]);

  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  const toggleMonthGroup = (monthId) => {
    setExpandedMonthGroups((current) => ({ ...current, [monthId]: !current[monthId] }));
  };

  const resetFilters = () => setFilters({ search: "", status: "all", color: "all" });

  const renderInvoiceCards = (items) => (
    <div className="invoice-grid">{items.map((invoice) => (
      <InvoiceCard
        key={invoice.id}
        invoice={invoice}
        allowOverdueInvoiceEdits={allowOverdueInvoiceEdits}
        onAddEntry={invoiceModals.openEntry}
        onOpenItems={invoiceModals.openItems}
        onEditDueDate={invoiceModals.openEditDueDate}
        onTogglePaid={togglePaid}
        onDelete={deleteInvoice ? invoiceModals.openDelete : undefined}
      />
    ))}</div>
  );

  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("invoices.futureInvoices", "Faturas futuras")}</p><h2>{tt("invoices.invoices", "Faturas")}</h2></div>
        <div className="view-actions">
          {invoices.length > 0 && (
            <button className={`btn btn-ghost filter-toggle ${filterOpen || hasActiveFilters ? "active" : ""}`} type="button" onClick={() => setFilterOpen((current) => !current)}>
              <Filter size={16} /> {tt("invoices.filterInvoices", "Filtrar faturas")}
              {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => invoiceModals.openPurchase()}><Plus size={16} /> {tt("invoices.addPurchase", "Adicionar compra")}</button>
        </div>
      </div>
      {invoices.length ? (
        <>
          {filterOpen && <div className="invoice-filter">
            <div className="invoice-filter-head">
              <div>
                <span><Filter size={15} /> {tt("invoices.filterInvoices", "Filtrar faturas")}</span>
                <p>{tt("invoices.filterHint", "Encontre rapidamente a fatura que você procura.")}</p>
              </div>
              <strong>{filteredInvoices.length} <small>de {invoices.length}</small></strong>
            </div>
            <div className="invoice-filter-grid">
              <label className="invoice-filter-search">
                <span>{tt("invoices.nameOrDueDate", "Nome ou vencimento")}</span>
                <div className="invoice-search-field">
                  <Search size={17} />
                  <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder={tt("invoices.searchPlaceholder", "Busque por cartão, mês ou data")} />
                  {filters.search && <button type="button" onClick={() => setFilters({ ...filters, search: "" })} aria-label={tt("invoices.clearSearch", "Limpar busca")}><X size={15} /></button>}
                </div>
              </label>
              <div className="invoice-filter-status">
                <span>{tt("invoices.status", "Status")}</span>
                <div className="invoice-status-segments" role="group" aria-label={tt("invoices.status", "Status")}>
                  {statusOptions.map((option) => <button className={filters.status === option.value ? "active" : ""} type="button" key={option.value} onClick={() => setFilters({ ...filters, status: option.value })}>{filters.status === option.value && <Check size={13} />}{option.label}</button>)}
                </div>
              </div>
              <div className="invoice-filter-color">
                <span>{tt("invoices.color", "Cor")}</span>
                <div className="color-filter" aria-label="Filtrar por cor">
                  <button className={filters.color === "all" ? "active" : ""} type="button" onClick={() => setFilters({ ...filters, color: "all" })}>{filters.color === "all" && <Check size={13} />}{tt("invoices.all", "Todas")}</button>
                  {invoiceColors.map((color) => (
                    <button
                      className={filters.color === color ? "active" : ""}
                      key={color}
                      type="button"
                      style={{ "--invoice-color": color }}
                      onClick={() => setFilters({ ...filters, color })}
                      aria-label={`Filtrar cor ${color}`}
                      title={`Filtrar cor ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {hasActiveFilters && (
              <div className="invoice-filter-footer"><span>{activeFilterCount} {activeFilterCount === 1 ? tt("invoices.activeFilter", "filtro ativo") : tt("invoices.activeFilters", "filtros ativos")}</span><button className="invoice-filter-reset" type="button" onClick={resetFilters}><X size={14} /> {tt("invoices.clearFilters", "Limpar filtros")}</button></div>
            )}
          </div>}
          {filteredInvoices.length ? (
            <div className="invoice-groups">
              {invoiceGroups.map((group) => {
                const expanded = expandedGroups[group.id];
                const groupTotal = group.items.reduce((total, invoice) => total + Number(invoice.total_amount || 0), 0);
                const groupProjected = group.items.reduce((total, invoice) => total + Number(invoice.projected_amount || 0), 0);
                return (
                  <section className={`invoice-group ${expanded ? "expanded" : "collapsed"}`} key={group.id}>
                    <button className="invoice-group-toggle" type="button" onClick={() => toggleGroup(group.id)} aria-expanded={expanded}>
                      <div className="invoice-group-head">
                        <h3>{group.label}</h3>
                        <small>{group.items.length}</small>
                      </div>
                      <div className="invoice-group-meta">
                        {group.items.length > 0 && <strong>{formatMoney(groupTotal)}</strong>}
                        {groupProjected > 0 && <strong className="is-projected">{tt("invoices.projected", "Previsto")} {formatMoney(groupTotal + groupProjected)}</strong>}
                      </div>
                      <ChevronDown className="invoice-group-chevron" size={18} />
                    </button>
                    {expanded && (
                      group.items.length ? (
                        group.id === "other" ? (
                          <div className="invoice-month-groups">
                            {otherInvoiceMonthGroups.map((monthGroup) => {
                              const monthExpanded = Boolean(expandedMonthGroups[monthGroup.id]);
                              const monthTotal = monthGroup.items.reduce((total, invoice) => total + Number(invoice.total_amount || 0), 0);
                              const monthProjected = monthGroup.items.reduce((total, invoice) => total + Number(invoice.projected_amount || 0), 0);
                              return <section className={`invoice-month-group ${monthExpanded ? "expanded" : "collapsed"}`} key={monthGroup.id}>
                                <button className="invoice-month-toggle" type="button" onClick={() => toggleMonthGroup(monthGroup.id)} aria-expanded={monthExpanded}>
                                  <span><strong>{monthGroup.label}</strong><small>{monthGroup.items.length} {monthGroup.items.length === 1 ? tt("invoices.invoiceSingular", "fatura") : tt("invoices.invoicePlural", "faturas")}</small></span>
                                  <span className="invoice-month-values"><strong>{formatMoney(monthTotal)}</strong>{monthProjected > 0 && <small>{tt("invoices.projected", "Previsto")} {formatMoney(monthTotal + monthProjected)}</small>}</span>
                                  <ChevronDown size={17} />
                                </button>
                                {monthExpanded && <div className="invoice-month-content">{renderInvoiceCards(monthGroup.items)}</div>}
                              </section>;
                            })}
                          </div>
                        ) : renderInvoiceCards(group.items)
                      ) : <div className="invoice-group-empty">{group.empty}</div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura encontrada.</h3><p>Ajuste os filtros para ver outras faturas.</p></div>}
        </>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura cadastrada.</h3><p>Clique em Nova fatura para criar.</p></div>}
      <button className="fab" onClick={() => invoiceModals.openPurchase()} aria-label={tt("invoices.addPurchase", "Adicionar compra")}><Plus /></button>
      {invoiceModals.element}
    </section>
  );
}


