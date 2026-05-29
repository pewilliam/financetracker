import { useEffect, useRef, useState } from "react";
import { ChevronDown, CreditCard, Filter, Plus } from "lucide-react";
import InvoiceCard from "../components/InvoiceCard.jsx";
import { useI18n } from "../i18n/index.ts";
import { normalizeInvoiceColor, yearMonthKey } from "../app/helpers.js";

export default function InvoicesPage({ invoices, addItem, addInstallment, deleteItem, deleteInstallmentItem, togglePaid, openModal, openInstallmentModal, openDuplicateInvoiceModal, onViewInstallment }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [filters, setFilters] = useState({ search: "", statuses: ["open", "paid"], color: "all" });
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const statusMenuRef = useRef(null);
  const invoiceColors = [...new Set(invoices.map((invoice) => normalizeInvoiceColor(invoice.color)))];
  const statusLabelByValue = { open: tt("invoices.pending", "Pendentes"), paid: tt("invoices.paid", "Pagas") };
  const statusOrder = ["open", "paid"];
  const selectedStatusCount = filters.statuses.length;
  const statusSummary = selectedStatusCount === statusOrder.length
    ? tt("invoices.all", "Todas")
    : selectedStatusCount === 1
      ? statusLabelByValue[filters.statuses[0]]
      : `${selectedStatusCount} selecionados`;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!statusMenuRef.current?.contains(event.target)) setStatusMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setStatusMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const toggleStatus = (status) => {
    setFilters((current) => {
      const nextStatuses = current.statuses.includes(status)
        ? current.statuses.filter((item) => item !== status)
        : [...current.statuses, status];
      return { ...current, statuses: nextStatuses };
    });
  };

  const selectAllStatuses = () => {
    setFilters((current) => ({ ...current, statuses: statusOrder }));
  };

  const clearStatuses = () => {
    setFilters((current) => ({ ...current, statuses: [] }));
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || `${invoice.name} ${invoice.due_date}`.toLowerCase().includes(search);
    const invoiceStatus = invoice.paid ? "paid" : "open";
    const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(invoiceStatus);
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
  const hasActiveFilters = filters.search || filters.statuses.length !== statusOrder.length || filters.color !== "all";
  const invoiceGroups = [
    { id: "current", label: tt("invoices.currentMonth", "Mês atual"), items: currentMonthInvoices, empty: "Sem faturas para o mês atual." },
    { id: "next", label: tt("invoices.nextMonth", "Próximo mês"), items: nextMonthInvoices, empty: "Sem faturas para o próximo mês." },
    { id: "other", label: "Demais faturas", items: otherInvoices, empty: "Sem demais faturas." },
    { id: "paid", label: "Faturas pagas", items: paidInvoices, empty: "Sem faturas pagas." }
  ].filter((group) => group.id !== "other" || group.items.length > 0);

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = {};
      invoiceGroups.forEach((group) => {
        next[group.id] = current[group.id] ?? (group.id !== "other" && group.id !== "paid" && group.items.length > 0);
      });
      return next;
    });
  }, [currentMonthInvoices.length, nextMonthInvoices.length, otherInvoices.length, paidInvoices.length]);

  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("invoices.futureInvoices", "Faturas futuras")}</p><h2>{tt("invoices.invoices", "Faturas")}</h2></div>
        <div className="view-actions">
          {invoices.length > 0 && (
            <button className={`btn btn-ghost filter-toggle ${filterOpen || hasActiveFilters ? "active" : ""}`} type="button" onClick={() => setFilterOpen((current) => !current)}>
              <Filter size={16} /> {tt("invoices.filterInvoices", "Filtrar faturas")}
            </button>
          )}
          <button className="btn" onClick={openInstallmentModal}><CreditCard size={16} /> {tt("invoices.installmentPurchase", "Compra parcelada")}</button>
          <button className="btn btn-primary" onClick={openModal}><Plus size={16} /> {tt("invoices.newInvoice", "Nova fatura")}</button>
        </div>
      </div>
      {invoices.length ? (
        <>
          {filterOpen && <div className="invoice-filter">
            <div className="invoice-filter-head">
              <span><Filter size={15} /> {tt("invoices.filterInvoices", "Filtrar faturas")}</span>
              <small>{filteredInvoices.length} de {invoices.length}</small>
            </div>
            <div className="invoice-filter-grid">
              <label className="invoice-filter-search">
                <span>{tt("invoices.nameOrDueDate", "Nome ou vencimento")}</span>
                <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder={tt("invoices.searchPlaceholder", "Procure por nome, mês ou data")} />
                <small>{tt("invoices.searchHint", "Busca por nome, mês ou vencimento da fatura.")}</small>
              </label>
              <div className="invoice-filter-status" ref={statusMenuRef}>
                <span>{tt("invoices.status", "Status")}</span>
                <button
                  className={`invoice-status-trigger ${statusMenuOpen ? "open" : ""}`}
                  type="button"
                  onClick={() => setStatusMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={statusMenuOpen}
                >
                  <span>{statusSummary}</span>
                  <ChevronDown size={16} />
                </button>
                {statusMenuOpen && (
                  <div className="invoice-status-menu" role="menu" aria-label="Selecionar status">
                    <button type="button" className="invoice-status-menu-action" onClick={selectAllStatuses}>Selecionar todas</button>
                    {statusOrder.map((status) => (
                      <label key={status} className={`invoice-status-option ${filters.statuses.includes(status) ? "active" : ""}`}>
                        <input
                          type="checkbox"
                          checked={filters.statuses.includes(status)}
                          onChange={() => toggleStatus(status)}
                        />
                        <div>
                          <strong>{statusLabelByValue[status]}</strong>
                          <small>{status === "open" ? "Ainda em aberto" : "Já quitadas"}</small>
                        </div>
                      </label>
                    ))}
                    <button type="button" className="invoice-status-menu-action subtle" onClick={clearStatuses}>Limpar seleção</button>
                  </div>
                )}
              </div>
              <div className="invoice-filter-color">
                <span>{tt("invoices.color", "Cor")}</span>
                <div className="color-filter" aria-label="Filtrar por cor">
                  <button className={filters.color === "all" ? "active" : ""} type="button" onClick={() => setFilters({ ...filters, color: "all" })}>{tt("invoices.all", "Todas")}</button>
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
              <button className="invoice-filter-reset" type="button" onClick={() => setFilters({ search: "", statuses: ["open", "paid"], color: "all" })}>
                Limpar filtros
              </button>
            )}
          </div>}
          {filteredInvoices.length ? (
            <div className="invoice-groups">
              {invoiceGroups.map((group) => {
                const expanded = expandedGroups[group.id];
                return (
                  <section className={`invoice-group ${expanded ? "expanded" : "collapsed"}`} key={group.id}>
                    <button className="invoice-group-toggle" type="button" onClick={() => toggleGroup(group.id)} aria-expanded={expanded}>
                      <div className="invoice-group-head">
                        <h3>{group.label}</h3>
                        <small>{group.items.length}</small>
                      </div>
                      <ChevronDown size={18} />
                    </button>
                    {expanded && (
                      group.items.length ? (
                        <div className="invoice-grid">{group.items.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} onAddItem={addItem} onAddInstallment={addInstallment} onDeleteItem={deleteItem} onDeleteInstallmentItem={deleteInstallmentItem} onTogglePaid={togglePaid} onDuplicateNext={openDuplicateInvoiceModal} onViewInstallment={onViewInstallment} />)}</div>
                      ) : <div className="invoice-group-empty">{group.empty}</div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura encontrada.</h3><p>Ajuste os filtros para ver outras faturas.</p></div>}
        </>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura cadastrada.</h3><p>Clique em Nova fatura para criar.</p></div>}
      <button className="fab" onClick={openModal} aria-label="Criar fatura"><Plus /></button>
    </section>
  );
}


