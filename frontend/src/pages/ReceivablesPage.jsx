import { useState } from "react";
import { Check, Filter, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, formatMonthLabel } from "../utils/format.js";
import { receivableStatusText, todayIsoDate } from "../app/helpers.js";

export default function ReceivablesPage({ receivables, onNew, onEdit, onPaid, onPayment, onDelete, onDeletePayment }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [filterOpen, setFilterOpen] = useState(false);
  const today = todayIsoDate();
  const currentMonth = today.slice(0, 7);

  const openReceivables = receivables.filter((item) => item.status !== "paid");
  const summaries = {
    totalOpen: openReceivables.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    overdue: receivables.filter((item) => item.status === "overdue").reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    dueThisMonth: openReceivables
      .filter((item) => item.due_date?.slice(0, 7) === currentMonth && item.due_date >= today)
      .reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    receivedThisMonth: receivables
      .flatMap((item) => item.payments || [])
      .filter((payment) => payment.paid_at?.slice(0, 7) === currentMonth)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  };

  const statusOptions = [
    ["all", tt("receivables.all", "Todas")],
    ["pending", tt("receivables.pending", "Pendentes")],
    ["partial", tt("receivables.partial", "Parciais")],
    ["overdue", tt("receivables.overdue", "Atrasadas")],
    ["paid", tt("receivables.paid", "Pagas")]
  ];

  const filtered = receivables.filter((item) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || `${item.person_name} ${item.description} ${item.due_date}`.toLowerCase().includes(search);
    const matchesStatus = filters.status === "all" || item.status === filters.status;
    return matchesSearch && matchesStatus;
  });
  const hasActiveFilters = filters.search || filters.status !== "all";

  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("receivables.title", "Recebíveis")}</p><h2>{tt("receivables.heading", "Recebíveis")}</h2></div>
        <div className="view-actions">
          <button className={`btn btn-ghost filter-toggle ${filterOpen || hasActiveFilters ? "active" : ""}`} type="button" onClick={() => setFilterOpen((current) => !current)}>
            <Filter size={16} /> {tt("receivables.filter", "Filtrar recebíveis")}
          </button>
          <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> {tt("receivables.new", "Nova conta")}</button>
        </div>
      </div>

      <section className="summary-grid receivable-summary">
        <article className="card stat-card stat-card-income">
          <p className="stat-label">{tt("receivables.totalOpen", "Total a receber")}</p>
          <p className="stat-value">{formatMoney(summaries.totalOpen, language)}</p>
          <p className="stat-meta">{openReceivables.length} {openReceivables.length === 1 ? tt("receivables.openItem", "conta aberta") : tt("receivables.openItems", "contas abertas")}</p>
        </article>
        <article className="card stat-card stat-card-expense">
          <p className="stat-label">{tt("receivables.totalOverdue", "Total vencido")}</p>
          <p className="stat-value">{formatMoney(summaries.overdue, language)}</p>
          <p className="stat-meta">{receivables.filter((item) => item.status === "overdue").length} {tt("receivables.overdue", "atrasadas")}</p>
        </article>
        <article className="card stat-card">
          <p className="stat-label">{tt("receivables.dueThisMonth", "A vencer este mês")}</p>
          <p className="stat-value">{formatMoney(summaries.dueThisMonth, language)}</p>
          <p className="stat-meta">{formatMonthLabel(new Date().getFullYear(), new Date().getMonth() + 1, language)}</p>
        </article>
        <article className="card stat-card stat-card-balance">
          <p className="stat-label">{tt("receivables.receivedThisMonth", "Recebido no mês")}</p>
          <p className="stat-value">{formatMoney(summaries.receivedThisMonth, language)}</p>
          <p className="stat-meta">{tt("receivables.realizedIncome", "Ganho realizado")}</p>
        </article>
      </section>

      {filterOpen && <div className="invoice-filter receivable-filter">
        <div className="invoice-filter-head">
          <span><Filter size={15} /> {tt("receivables.filter", "Filtrar recebíveis")}</span>
          <small>{filtered.length} de {receivables.length}</small>
        </div>
        <div className="invoice-filter-grid receivable-filter-grid">
          <label className="invoice-filter-search">
            <span>{tt("receivables.search", "Pessoa ou descrição")}</span>
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder={tt("receivables.searchPlaceholder", "Buscar por pessoa, descrição ou data")} />
          </label>
          <label className="invoice-filter-status">
            <span>{tt("receivables.status", "Status")}</span>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {hasActiveFilters && (
          <button className="invoice-filter-reset" type="button" onClick={() => setFilters({ search: "", status: "all" })}>
            Limpar filtros
          </button>
        )}
      </div>}

      {filtered.length ? (
        <div className="receivable-list">
          {filtered.map((item) => {
            const progress = Math.min((Number(item.received_amount || 0) / Math.max(Number(item.total_amount || 1), 1)) * 100, 100);
            return (
              <article className={`receivable-card card ${item.status}`} key={item.id}>
                <header>
                  <div>
                    <h3>{item.person_name}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span className={`due-badge compact ${item.status === "overdue" ? "danger" : item.status === "paid" ? "paid" : ""}`}>{receivableStatusText(item.status, language)}</span>
                </header>
                <div className="receivable-money-grid">
                  <div className="metric-block"><span>{tt("receivables.total", "Total")}</span><strong>{formatMoney(item.total_amount, language)}</strong></div>
                  <div className="metric-block"><span>{tt("receivables.received", "Recebido")}</span><strong className="money-income">{formatMoney(item.received_amount, language)}</strong></div>
                  <div className="metric-block"><span>{tt("receivables.remaining", "Restante")}</span><strong>{formatMoney(item.remaining_amount, language)}</strong></div>
                  <div className="metric-block"><span>{tt("receivables.dueDate", "Vencimento")}</span><strong>{formatDateShort(item.due_date, language)}</strong></div>
                </div>
                <div className="installment-progress receivable-progress"><span style={{ width: `${progress}%` }} /></div>
                {item.notes && <p className="receivable-notes">{item.notes}</p>}
                {item.payments?.length > 0 && (
                  <div className="receivable-payments">
                    {item.payments.map((payment) => (
                      <button key={payment.id} type="button" onClick={() => onDeletePayment(item, payment)} title={tt("receivables.cancelPayment", "Cancelar pagamento")}>
                        <span>{formatDateShort(payment.paid_at, language)} · {formatMoney(payment.amount, language)}</span>
                        <X size={13} />
                      </button>
                    ))}
                  </div>
                )}
                <footer>
                  <button className="btn btn-ghost compact" onClick={() => onEdit(item)}>{tt("actions.edit", "Editar")}</button>
                  <button className="btn btn-ghost compact danger-text" onClick={() => onDelete(item)}><Trash2 size={15} /> {tt("actions.delete", "Excluir")}</button>
                  {item.status !== "paid" && (
                    <>
                      <button className="btn btn-ghost compact" onClick={() => onPayment(item)}>{tt("receivables.partialPayment", "Pagamento parcial")}</button>
                      <button className="btn btn-primary compact" onClick={() => onPaid(item)}><Check size={15} /> {tt("receivables.markPaid", "Marcar como pago")}</button>
                    </>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>{tt("receivables.empty", "Nenhuma conta a receber encontrada.")}</h3><p>{tt("receivables.emptyHint", "Cadastre uma nova conta ou ajuste os filtros.")}</p></div>}
      <button className="fab" onClick={onNew} aria-label="Criar recebível"><Plus /></button>
    </section>
  );
}


