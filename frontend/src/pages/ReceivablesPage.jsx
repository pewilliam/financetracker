import { useEffect, useState } from "react";
import { Filter, Plus } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, formatMonthLabel } from "../utils/format.js";
import { receivableStatusText, todayIsoDate } from "../app/helpers.js";
import ReceivableDetailsModal from "../modals/ReceivableDetailsModal.jsx";

function originGroupKey(item) {
  if (item.record_kind === "linked_transaction") {
    return `linked_transaction:${item.id}`;
  }
  if (item.series_id) {
    return `series:${item.series_id}`;
  }
  const expense = item.linked_expense;
  if (expense?.source_type && expense?.source_id != null) {
    if (expense.source_type === "installment_item" && expense.purchase_id != null) {
      return `purchase:${expense.purchase_id}:person:${item.person_id ?? item.person_name}`;
    }
    return `${expense.source_type}:${expense.source_id}`;
  }
  return `receivable:${item.id}`;
}

function groupStatus(items) {
  if (items.some((item) => item.status === "overdue")) return "overdue";
  if (items.every((item) => item.status === "paid")) return "paid";
  if (items.some((item) => item.status === "partial")) return "partial";
  if (items.some((item) => item.status === "pending")) return "pending";
  return items[0]?.status || "pending";
}

function sortReceivableItems(items) {
  return [...items].sort((left, right) => {
    const seriesDiff = (left.series_installment_number || 0) - (right.series_installment_number || 0);
    if (seriesDiff) return seriesDiff;
    return String(left.due_date).localeCompare(String(right.due_date)) || left.id - right.id;
  });
}

function buildReceivableGroups(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = originGroupKey(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  return [...buckets.entries()].map(([key, members]) => {
    const sorted = sortReceivableItems(members);
    const totalAmount = sorted.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const receivedAmount = sorted.reduce((sum, item) => sum + Number(item.received_amount || 0), 0);
    const remainingAmount = sorted.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0);
    const earliestDue = sorted.reduce((min, item) => (!min || item.due_date < min ? item.due_date : min), null);
    return {
      key,
      items: sorted,
      isGroup: sorted.length > 1,
      person_name: sorted[0].person_name,
      description: sorted[0].description,
      linked_expense: sorted.find((item) => item.linked_expense)?.linked_expense || null,
      categories: sorted[0].categories?.length ? sorted[0].categories : sorted[0].category ? [sorted[0].category] : [],
      status: groupStatus(sorted),
      total_amount: totalAmount,
      received_amount: receivedAmount,
      remaining_amount: remainingAmount,
      due_date: earliestDue,
      count: sorted.length
    };
  }).sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)) || left.key.localeCompare(right.key));
}

function ReceivableSummaryCard({ group, language, tt, onOpen }) {
  const progress = Math.min((Number(group.received_amount || 0) / Math.max(Number(group.total_amount || 1), 1)) * 100, 100);
  const countLabel = group.isGroup
    ? (group.count === 1
      ? tt("receivables.groupCountOne", "1 parcela")
      : tt("receivables.groupCount", `${group.count} parcelas`, { count: group.count }))
    : null;
  const primaryAmount = group.isGroup ? group.total_amount : group.remaining_amount;
  const amountHint = group.isGroup
    ? tt("receivables.total", "Total")
    : group.status === "paid"
      ? tt("receivables.total", "Total")
      : tt("receivables.remaining", "Restante");
  const displayAmount = group.isGroup || group.status !== "paid" ? primaryAmount : group.total_amount;

  return (
    <article
      className={`receivable-card receivable-summary-card card ${group.status} ${!group.isGroup && group.items[0].record_kind === "linked_transaction" ? "linked-transaction" : ""}`}
      tabIndex={0}
      role="button"
      onClick={() => onOpen(group.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(group.key);
        }
      }}
    >
      <header>
        <div>
          <h3>{group.person_name}</h3>
          <p>{group.description}</p>
        </div>
        <span className={`due-badge compact ${group.status === "overdue" ? "danger" : group.status === "paid" ? "paid" : ""}`}>
          {receivableStatusText(group.status, language)}
        </span>
      </header>

      <div className="receivable-summary-main">
        <div>
          <small>{amountHint}</small>
          <strong>{formatMoney(displayAmount, language)}</strong>
        </div>
        <div>
          <small>{group.isGroup ? tt("receivables.nextDue", "Próximo vencimento") : tt("receivables.dueDate", "Vencimento")}</small>
          <strong>{formatDateShort(group.due_date, language)}</strong>
        </div>
      </div>

      {(countLabel || group.categories.length > 0) && (
        <div className="receivable-group-meta">
          {group.categories.slice(0, 2).map((category) => (
            <span className="category-badge receivable-category-badge" style={{ "--category-color": category.color }} key={category.id}>{category.name}</span>
          ))}
          {countLabel && <span className="receivable-series-badge">{countLabel}</span>}
        </div>
      )}

      <div className="installment-progress receivable-progress"><span style={{ width: `${progress}%` }} /></div>
    </article>
  );
}

export default function ReceivablesPage({
  receivables,
  linkedTransactions = [],
  onNew,
  onEdit,
  onEditLinkedTransaction,
  onPaid,
  onPayment,
  onDelete,
  onDeletePayment,
  onOverlayChange,
  actionOverlayOpen = false
}) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailsKey, setDetailsKey] = useState(null);
  const today = todayIsoDate();
  const currentMonth = today.slice(0, 7);
  const linkedReceivables = linkedTransactions.map((transaction) => {
    const realized = transaction.date <= today;
    return {
      id: transaction.id,
      record_kind: "linked_transaction",
      transaction,
      person_name: tt("receivables.linkedEntry", "Lançamento associado"),
      description: transaction.description || tt("monthlyTable.noDescription", "Sem descrição"),
      total_amount: transaction.amount,
      received_amount: realized ? transaction.amount : 0,
      remaining_amount: realized ? 0 : transaction.amount,
      due_date: transaction.date,
      status: realized ? "paid" : "pending",
      category: transaction.category,
      categories: transaction.categories || [],
      linked_expense: transaction.linked_expense,
      payments: []
    };
  });
  const allReceivables = [
    ...receivables.map((item) => ({ ...item, record_kind: "receivable" })),
    ...linkedReceivables
  ].sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)) || left.id - right.id);

  const openReceivables = allReceivables.filter((item) => item.status !== "paid");
  const summaries = {
    totalOpen: openReceivables.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    overdue: allReceivables.filter((item) => item.status === "overdue").reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    dueThisMonth: openReceivables
      .filter((item) => item.due_date?.slice(0, 7) === currentMonth && item.due_date >= today)
      .reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    receivedThisMonth: receivables
      .flatMap((item) => item.payments || [])
      .filter((payment) => payment.paid_at?.slice(0, 7) === currentMonth)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      + linkedReceivables
        .filter((item) => item.status === "paid" && item.due_date?.slice(0, 7) === currentMonth)
        .reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  };

  const statusOptions = [
    ["all", tt("receivables.all", "Todas")],
    ["pending", tt("receivables.pending", "Pendentes")],
    ["partial", tt("receivables.partial", "Parciais")],
    ["overdue", tt("receivables.overdue", "Atrasadas")],
    ["paid", tt("receivables.paid", "Pagas")]
  ];

  const filtered = allReceivables.filter((item) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || `${item.person_name} ${item.description} ${item.due_date}`.toLowerCase().includes(search);
    const matchesStatus = filters.status === "all" || item.status === filters.status;
    return matchesSearch && matchesStatus;
  });
  const groups = buildReceivableGroups(filtered);
  const detailsGroup = detailsKey ? groups.find((group) => group.key === detailsKey) || null : null;
  const hasActiveFilters = filters.search || filters.status !== "all";

  useEffect(() => {
    onOverlayChange?.(Boolean(detailsGroup));
    return () => onOverlayChange?.(false);
  }, [detailsGroup, onOverlayChange]);

  useEffect(() => {
    if (detailsKey && !detailsGroup) setDetailsKey(null);
  }, [detailsKey, detailsGroup]);

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
          <p className="stat-meta">{allReceivables.filter((item) => item.status === "overdue").length} {tt("receivables.overdue", "atrasadas")}</p>
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
          <small>{filtered.length} de {allReceivables.length}</small>
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

      {groups.length ? (
        <div className="receivable-list">
          {groups.map((group) => (
            <ReceivableSummaryCard
              key={group.key}
              group={group}
              language={language}
              tt={tt}
              onOpen={setDetailsKey}
            />
          ))}
        </div>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>{tt("receivables.empty", "Nenhuma conta a receber encontrada.")}</h3><p>{tt("receivables.emptyHint", "Cadastre uma nova conta ou ajuste os filtros.")}</p></div>}

      <button className="fab" onClick={onNew} aria-label="Criar recebível"><Plus /></button>

      {detailsGroup && (
        <ReceivableDetailsModal
          group={detailsGroup}
          busy={actionOverlayOpen}
          onClose={() => setDetailsKey(null)}
          onEdit={onEdit}
          onEditLinkedTransaction={onEditLinkedTransaction}
          onPaid={onPaid}
          onPayment={onPayment}
          onDelete={onDelete}
          onDeletePayment={onDeletePayment}
        />
      )}
    </section>
  );
}
