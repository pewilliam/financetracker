import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CreditCard,
  EllipsisVertical, Filter, Grid2X2, List, Loader2, Plus, Search, Tags, Trash2, X
} from "lucide-react";
import { listInstallmentPage } from "../api/api.js";
import CategorySelect from "../components/CategorySelect.jsx";
import FilterSelect from "../components/common/FilterSelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

const VIEW_KEY = "installments-view-mode";
const EMPTY_SUMMARY = {
  active_count: 0, paid_off_count: 0, current_month_count: 0, current_month_amount: 0,
  remaining_amount: 0, overdue_count: 0, overdue_amount: 0, forecast: []
};

function isPaidOff(purchase) {
  return purchase.installment_count > 0 && purchase.paid_installments === purchase.installment_count;
}

function progressOf(purchase) {
  return purchase.installment_count ? purchase.paid_installments / purchase.installment_count : 0;
}

function pendingItems(purchase) {
  return (purchase.items || []).filter((item) => item.status === "pending" && !item.invoice?.paid);
}

function nextPendingItem(purchase) {
  return purchase.next_installment || [...pendingItems(purchase)]
    .filter((item) => item.invoice?.due_date)
    .sort((a, b) => a.invoice.due_date.localeCompare(b.invoice.due_date))[0] || null;
}

function daysFromToday(dateString) {
  if (!dateString) return null;
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  const due = new Date(year, month - 1, day, 12);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((due - today) / 86400000);
}

function purchaseSituation(purchase) {
  if (isPaidOff(purchase)) return { id: "paid", label: "Quitada", tone: "paid" };
  const earliestDue = pendingItems(purchase).filter((item) => item.invoice?.due_date).sort((a, b) => a.invoice.due_date.localeCompare(b.invoice.due_date))[0];
  if (!earliestDue) return { id: "regular", label: "Sem vencimento", tone: "neutral" };
  const days = daysFromToday(earliestDue.invoice.due_date);
  if (days < 0) return { id: "overdue", label: `Atrasada há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`, tone: "danger" };
  if (days === 0) return { id: "soon", label: "Vence hoje", tone: "warning" };
  if (days <= 7) return { id: "soon", label: `Em ${days} ${days === 1 ? "dia" : "dias"}`, tone: "warning" };
  return { id: "regular", label: `Em ${days} dias`, tone: "success" };
}

function purchaseCategories(purchase) {
  return purchase.categories?.length ? purchase.categories : purchase.category ? [purchase.category] : [];
}

function StatusBadge({ purchase }) {
  const status = purchaseSituation(purchase);
  return <span className={`installment-status ${status.tone}`}>{status.label}</span>;
}

function CategoryBadges({ purchase }) {
  const categories = purchaseCategories(purchase);
  return <span className="installment-categories">{categories.length ? categories.map((category) => (
    <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>
  )) : <span className="category-badge uncategorized">Sem categoria</span>}</span>;
}

function PurchaseMenu({ purchase, onDetails, onRequestDelete }) {
  return (
    <details className="installment-menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <summary className="icon-btn small" aria-label={`Ações de ${purchase.description}`} title="Mais ações"><EllipsisVertical size={17} /></summary>
      <div className="installment-menu-popover">
        <button type="button" onClick={() => onDetails(purchase.id)}>Ver detalhes</button>
        <button type="button" onClick={() => onDetails(purchase.id, true)}>Editar compra</button>
        <button className="danger-text" type="button" onClick={() => onRequestDelete(purchase)}><Trash2 size={14} /> Remover compra</button>
      </div>
    </details>
  );
}

function InstallmentCard({ purchase, onDetails, onRequestDelete }) {
  const paid = isPaidOff(purchase);
  const pct = Math.min(100, Math.max(0, progressOf(purchase) * 100));
  const next = nextPendingItem(purchase);
  const lastPaidInvoiceDate = [...(purchase.items || [])].filter((item) => item.invoice?.paid && item.invoice?.due_date).sort((a, b) => b.invoice.due_date.localeCompare(a.invoice.due_date))[0]?.invoice?.due_date;
  return (
    <article className={`installment-card ${paid ? "is-paid" : ""}`} tabIndex="0" role="button" onClick={() => onDetails(purchase.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onDetails(purchase.id); } }}>
      <header><span className="installment-card-icon"><CreditCard size={18} /></span><div className="installment-card-title"><h3>{purchase.description}</h3><CategoryBadges purchase={purchase} /></div><PurchaseMenu purchase={purchase} onDetails={onDetails} onRequestDelete={onRequestDelete} /></header>
      <div className="installment-main-value"><strong>{formatMoney(purchase.installment_value)} <small>por mês</small></strong><span>{purchase.installment_count} parcelas · Total de {formatMoney(purchase.total_amount)}</span></div>
      <div className="installment-progress-block"><div><span>{purchase.paid_installments} de {purchase.installment_count} parcelas pagas</span><strong>{formatMoney(purchase.remaining_amount)} restantes</strong></div><div className="installment-progress" role="progressbar" aria-label={`Progresso: ${purchase.paid_installments} de ${purchase.installment_count} parcelas`} aria-valuemin="0" aria-valuemax={purchase.installment_count} aria-valuenow={purchase.paid_installments}><span style={{ width: `${pct}%` }} /></div></div>
      {paid ? <div className="installment-next paid-summary"><div><small>Valor total pago</small><strong>{formatMoney(purchase.paid_amount || purchase.total_amount)}</strong>{lastPaidInvoiceDate && <span>Última fatura paga: {formatDateShort(lastPaidInvoiceDate)}</span>}</div><StatusBadge purchase={purchase} /></div> : <div className="installment-next"><div><small>Próxima parcela</small><strong>{next ? formatMoney(next.amount) : "Realocação necessária"}</strong><span>{next?.invoice ? `${next.invoice.name} · ${formatDateShort(next.invoice.due_date)}` : "Fatura removida"}</span></div><StatusBadge purchase={purchase} /></div>}
    </article>
  );
}

function InstallmentTable({ purchases, onDetails, onRequestDelete }) {
  return (
    <div className="installment-table-wrap"><table className="installment-table">
      <thead><tr><th>Compra</th><th>Categoria</th><th>Parcela</th><th>Progresso</th><th>Próximo vencimento</th><th className="money-cell">Restante</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{purchases.map((purchase) => { const next = nextPendingItem(purchase); const pct = Math.round(progressOf(purchase) * 100); return (
        <tr key={purchase.id} tabIndex="0" onClick={() => onDetails(purchase.id)} onKeyDown={(event) => { if (event.key === "Enter") onDetails(purchase.id); }}>
          <td data-label="Compra"><span className="installment-table-name"><CreditCard size={16} />{purchase.description}</span></td><td data-label="Categoria"><CategoryBadges purchase={purchase} /></td><td data-label="Parcela"><strong>{formatMoney(purchase.installment_value)}</strong><small>{purchase.installment_count}x</small></td>
          <td data-label="Progresso"><div className="installment-table-progress"><span>{purchase.paid_installments}/{purchase.installment_count}</span><div className="installment-progress"><span style={{ width: `${pct}%` }} /></div></div></td>
          <td data-label="Próximo vencimento">{isPaidOff(purchase) ? "—" : next?.invoice ? <><strong>{formatDateShort(next.invoice.due_date)}</strong><small>{next.invoice.name}</small></> : <small>Sem fatura</small>}</td><td className="money-cell" data-label="Restante"><strong>{formatMoney(purchase.remaining_amount)}</strong></td><td data-label="Situação"><StatusBadge purchase={purchase} /></td><td data-label="Ações"><PurchaseMenu purchase={purchase} onDetails={onDetails} onRequestDelete={onRequestDelete} /></td>
        </tr>
      ); })}</tbody>
    </table></div>
  );
}

function Pagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange }) {
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((value) => value > 0 && value <= totalPages).sort((a, b) => a - b);
  return (
    <nav className="installment-pagination" aria-label="Paginação dos parcelamentos">
      <span>Mostrando <strong>{first}–{last}</strong> de <strong>{total}</strong></span>
      <label><span>Por página</span><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}><option value="12">12</option><option value="24">24</option><option value="48">48</option></select></label>
      <div><button className="icon-btn small" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>{pages.map((value, index) => <span key={value}>{index > 0 && value - pages[index - 1] > 1 && <i>…</i>}<button className={value === page ? "active" : ""} type="button" aria-current={value === page ? "page" : undefined} onClick={() => onPageChange(value)}>{value}</button></span>)}<button className="icon-btn small" type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button></div>
    </nav>
  );
}

export default function InstallmentsPage({ categories = [], invoices = [], revision = 0, onNew, onDetails, onRequestDelete }) {
  const { language } = useI18n();
  const [activeTab, setActiveTab] = useState("inProgress");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryIds, setCategoryIds] = useState([]);
  const [invoice, setInvoice] = useState("all");
  const [situation, setSituation] = useState("all");
  const [sortBy, setSortBy] = useState("nextDue");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [data, setData] = useState({ items: [], page: 1, page_size: 12, total: 0, total_pages: 0, summary: EMPTY_SUMMARY });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const requestSequence = useRef(0);
  const [viewMode, setViewMode] = useState(() => { try { return sessionStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards"; } catch { return "cards"; } });

  useEffect(() => { const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const sequence = ++requestSequence.current;
    setLoading(true); setLoadError(false);
    listInstallmentPage({ tab: activeTab === "inProgress" ? "active" : "paid", search: debouncedQuery, categoryIds, invoiceTemplateId: invoice === "all" ? "" : invoice, situation, sortBy, page, pageSize })
      .then((payload) => { if (sequence !== requestSequence.current) return; if (payload.total_pages > 0 && page > payload.total_pages) { setPage(payload.total_pages); return; } setData(payload); })
      .catch(() => { if (sequence === requestSequence.current) setLoadError(true); })
      .finally(() => { if (sequence === requestSequence.current) setLoading(false); });
  }, [activeTab, debouncedQuery, categoryIds, invoice, situation, sortBy, page, pageSize, revision, retryToken]);

  const invoiceSources = useMemo(() => { const map = new Map(); invoices.forEach((item) => map.set(String(item.template_id ?? item.id), item)); return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")); }, [invoices]);
  const summary = data.summary || EMPTY_SUMMARY;
  const maxForecast = Math.max(...(summary.forecast || []).map((item) => Number(item.amount)), 0);
  const totalPurchases = Number(summary.active_count) + Number(summary.paid_off_count);
  const updateFilter = (setter) => (value) => { setter(value); setPage(1); };
  const activeFilters = [
    query && { id: "query", label: `Busca: ${query}`, clear: () => { setQuery(""); setDebouncedQuery(""); setPage(1); } },
    ...categoryIds.map((id) => ({
      id: `category-${id}`,
      label: categories.find((item) => String(item.id) === id)?.name || id,
      clear: () => { setCategoryIds((current) => current.filter((item) => item !== id)); setPage(1); },
    })),
    invoice !== "all" && { id: "invoice", label: `Cartão/fatura: ${invoiceSources.find((item) => String(item.template_id ?? item.id) === invoice)?.name}`, clear: () => updateFilter(setInvoice)("all") },
    situation !== "all" && { id: "situation", label: `Situação: ${{ regular: "Em dia", soon: "Vence em breve", overdue: "Atrasados" }[situation]}`, clear: () => updateFilter(setSituation)("all") },
  ].filter(Boolean);
  const clearFilters = () => { setQuery(""); setDebouncedQuery(""); setCategoryIds([]); setInvoice("all"); setSituation("all"); setPage(1); };
  const changeView = (mode) => { setViewMode(mode); try { sessionStorage.setItem(VIEW_KEY, mode); } catch { /* unavailable */ } };
  const changeTab = (tab) => { setActiveTab(tab); setPage(1); };
  const handleTabsKey = (event) => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]; const target = tabs[tabs.indexOf(document.activeElement) === 0 ? 1 : 0]; target?.focus(); target?.click(); };
  const invoiceOptions = [{ value: "all", label: "Todos" }, ...invoiceSources.map((item) => ({ value: String(item.template_id ?? item.id), label: item.name, color: item.color }))];
  const situationOptions = [{ value: "all", label: "Todos" }, { value: "regular", label: "Em dia", color: "#14A078" }, { value: "soon", label: "Vence em breve", color: "#D99A18" }, { value: "overdue", label: "Atrasados", color: "#FF4D6A" }];
  const sortOptions = [{ value: "nextDue", label: "Próximo vencimento" }, { value: "remaining", label: "Maior valor restante" }, { value: "installment", label: "Maior valor da parcela" }, { value: "progress", label: "Maior progresso" }, { value: "newest", label: "Mais recentes" }, { value: "oldest", label: "Mais antigos" }, { value: "alphabetical", label: "Ordem alfabética" }];

  return (
    <section className="installments-page">
      <div className="installments-page-head"><div><p className="eyebrow">Compras parceladas</p><h1>Parcelamentos</h1><p>Acompanhe suas parcelas, próximos vencimentos e valores ainda pendentes.</p></div><button className="btn btn-primary" type="button" onClick={onNew}><Plus size={16} /> Nova compra parcelada</button></div>
      {loadError && !data.items.length ? <div className="installment-empty-results primary-empty error"><span><AlertTriangle size={26} /></span><h3>Não foi possível carregar os parcelamentos</h3><p>Confira sua conexão e tente atualizar os dados.</p><button className="btn btn-primary" type="button" onClick={() => setRetryToken((value) => value + 1)}>Tentar novamente</button></div> : <>
        <div className="installment-summary-grid"><div><span><CreditCard size={16} />Compras em andamento</span><strong>{summary.active_count}</strong><small>{summary.active_count === 1 ? "compra ativa" : "compras ativas"}</small></div><div><span><CalendarClock size={16} />Parcelas deste mês</span><strong>{summary.current_month_count}</strong><small>com vencimento no mês</small></div><div><span>Valor neste mês</span><strong>{formatMoney(summary.current_month_amount)}</strong><small>a pagar neste mês</small></div><div><span>Saldo restante</span><strong>{formatMoney(summary.remaining_amount)}</strong><small>ainda pendentes</small></div></div>
        {summary.overdue_count > 0 && <div className="installment-overdue-alert"><AlertTriangle size={17} /><strong>{summary.overdue_count} {summary.overdue_count === 1 ? "parcela atrasada" : "parcelas atrasadas"}</strong><span>— {formatMoney(summary.overdue_amount)}</span></div>}
        <section className={`installment-forecast ${forecastOpen ? "open" : ""}`}><button type="button" onClick={() => setForecastOpen((current) => !current)} aria-expanded={forecastOpen}><span><CalendarClock size={17} /><strong>Comprometimento dos próximos meses</strong><small>Previsão baseada nas parcelas pendentes</small></span><ChevronDown size={18} /></button>{forecastOpen && <div className="installment-forecast-bars">{(summary.forecast || []).map((item) => { const [year, month] = item.month.split("-").map(Number); const label = new Intl.DateTimeFormat(language || "pt-BR", { month: "short" }).format(new Date(year, month - 1, 1)).replace(".", ""); return <div key={item.month}><span>{label}</span><div><i style={{ height: `${maxForecast ? Math.max(5, Number(item.amount) / maxForecast * 100) : 0}%` }} /></div><strong>{formatMoney(item.amount)}</strong></div>; })}</div>}</section>
        <nav className="installment-tabs" role="tablist" aria-label="Situação das compras parceladas" onKeyDown={handleTabsKey}><button id="installment-tab-active" type="button" role="tab" aria-selected={activeTab === "inProgress"} aria-controls="installment-panel" tabIndex={activeTab === "inProgress" ? 0 : -1} className={activeTab === "inProgress" ? "active" : ""} onClick={() => changeTab("inProgress")}>Em andamento <span>{summary.active_count}</span></button><button id="installment-tab-paid" type="button" role="tab" aria-selected={activeTab === "paidOff"} aria-controls="installment-panel" tabIndex={activeTab === "paidOff" ? 0 : -1} className={activeTab === "paidOff" ? "active" : ""} onClick={() => changeTab("paidOff")}>Quitados <span>{summary.paid_off_count}</span></button></nav>
        <div className="installment-tools">
          <label className="installment-search"><Search size={17} /><span className="sr-only">Buscar compra por nome</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome..." />{query && <button type="button" onClick={() => { setQuery(""); setDebouncedQuery(""); }} aria-label="Limpar busca"><X size={15} /></button>}</label>
          <button className={`btn installment-filter-trigger ${filtersOpen ? "active" : ""}`} type="button" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen} aria-controls="installment-filter-fields"><Filter size={16} /> Filtros {activeFilters.length > 0 && <span>{activeFilters.length}</span>}<ChevronDown size={16} /></button>
          <div className={`installment-filter-fields ${filtersOpen ? "open" : ""}`} id="installment-filter-fields">
            <div className="installment-filter-field"><span>Categoria</span><CategorySelect className="installment-filter-select" categories={categories} values={categoryIds} onChange={(values) => { setCategoryIds(values); setPage(1); }} placeholder="Todas as categorias" searchPlaceholder="Buscar categoria..." ariaLabel="Categorias do filtro" showBulkActions /></div>
            <div className="installment-filter-field"><span>Cartão ou fatura</span><FilterSelect value={invoice} options={invoiceOptions} onChange={updateFilter(setInvoice)} ariaLabel="Cartão ou fatura" searchable searchPlaceholder="Buscar cartão ou fatura..." /></div>
            <div className="installment-filter-field"><span>Situação</span><FilterSelect value={situation} options={situationOptions} onChange={updateFilter(setSituation)} ariaLabel="Situação" /></div>
            <div className="installment-filter-field"><span>Ordenar por</span><FilterSelect value={sortBy} options={sortOptions} onChange={updateFilter(setSortBy)} ariaLabel="Ordenar por" /></div>
          </div>
          <div className="view-toggle installment-view-toggle" aria-label="Alternar visualização"><button type="button" className={viewMode === "cards" ? "active" : ""} aria-pressed={viewMode === "cards"} onClick={() => changeView("cards")}><Grid2X2 size={16} /> Cards</button><button type="button" className={viewMode === "table" ? "active" : ""} aria-pressed={viewMode === "table"} onClick={() => changeView("table")}><List size={16} /> Tabela</button></div>
        </div>
        {activeFilters.length > 0 && <div className="installment-filter-chips">{activeFilters.map((item) => <button type="button" key={item.id} onClick={item.clear}>{item.label}<X size={13} /></button>)}<button className="clear" type="button" onClick={clearFilters}>Limpar filtros</button></div>}
        <section className={loading ? "installment-results is-loading" : "installment-results"} id="installment-panel" role="tabpanel" aria-busy={loading} aria-labelledby={activeTab === "inProgress" ? "installment-tab-active" : "installment-tab-paid"}>{loading && !data.items.length ? <div className="installment-page-loading"><Loader2 className="spin" size={22} /><span>Carregando parcelamentos...</span></div> : data.items.length ? (viewMode === "table" ? <InstallmentTable purchases={data.items} onDetails={onDetails} onRequestDelete={onRequestDelete} /> : <div className="installment-grid">{data.items.map((purchase) => <InstallmentCard key={purchase.id} purchase={purchase} onDetails={onDetails} onRequestDelete={onRequestDelete} />)}</div>) : <div className={`installment-empty-results ${totalPurchases ? "" : "primary-empty"}`}><span>{activeFilters.length ? <Search size={22} /> : <Tags size={22} />}</span><h3>{activeFilters.length ? "Nenhum resultado encontrado" : totalPurchases ? activeTab === "paidOff" ? "Nenhuma compra quitada" : "Nenhuma compra em andamento" : "Nenhuma compra parcelada"}</h3><p>{activeFilters.length ? "Tente remover alguns filtros ou buscar por outro nome." : totalPurchases ? "As compras correspondentes aparecerão aqui." : "Cadastre uma compra para acompanhar vencimentos e o saldo restante."}</p>{activeFilters.length ? <button className="btn btn-ghost" type="button" onClick={clearFilters}>Limpar filtros</button> : !totalPurchases && <button className="btn btn-primary" type="button" onClick={onNew}><Plus size={16} /> Adicionar compra parcelada</button>}</div>}</section>
        <Pagination page={data.page || page} pageSize={pageSize} total={data.total} totalPages={data.total_pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </>}
    </section>
  );
}
