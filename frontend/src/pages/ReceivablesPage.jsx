import { useEffect, useState } from "react";
import { ChevronDown, Filter, Plus } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, formatMonthLabel } from "../utils/format.js";
import { receivableStatusText, todayIsoDate } from "../app/helpers.js";
import ReceivableDetailsModal from "../modals/ReceivableDetailsModal.jsx";

export function originGroupKey(item) {
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

export function buildReceivableGroups(items) {
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

export function receivableGroupForId(receivables, receivableId) {
  if (!receivableId) return null;
  const items = (receivables || []).map((item) => ({ ...item, record_kind: "receivable" }));
  const match = items.find((item) => Number(item.id) === Number(receivableId));
  if (!match) return null;
  const key = originGroupKey(match);
  return buildReceivableGroups(items).find((group) => group.key === key) || null;
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

const ACTIVE_STATUSES = ["overdue", "pending", "partial"];
const STATUS_SECTIONS = [...ACTIVE_STATUSES, "paid"];

export default function ReceivablesPage({
  receivables,
  linkedTransactions = [],
  summary = null,
  paidLoaded = false,
  paidLoading = false,
  onExpandPaid,
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
  const [filters, setFilters] = useState({ search: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailsKey, setDetailsKey] = useState(null);
  const [openSections, setOpenSections] = useState(() => new Set(
    ACTIVE_STATUSES.filter((status) => Number(summary?.group_counts?.[status] ?? 1) > 0)
  ));
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

  const statusLabels = {
    overdue: tt("receivables.overdue", "Atrasadas"),
    pending: tt("receivables.pending", "Pendentes"),
    partial: tt("receivables.partial", "Parciais"),
    paid: tt("receivables.paid", "Pagas")
  };

  const filtered = allReceivables.filter((item) => {
    const search = filters.search.trim().toLowerCase();
    return !search || `${item.person_name} ${item.description} ${item.due_date}`.toLowerCase().includes(search);
  });
  const groups = buildReceivableGroups(filtered);
  const groupsByStatus = Object.fromEntries(STATUS_SECTIONS.map((status) => [
    status,
    groups.filter((group) => group.status === status)
  ]));
  const detailsGroup = detailsKey ? groups.find((group) => group.key === detailsKey) || null : null;
  const hasActiveFilters = Boolean(filters.search);
  const cards = summary ? {
    totalOpen: summary.total_open,
    openCount: summary.open_count,
    overdue: summary.total_overdue,
    overdueCount: summary.overdue_count,
    dueThisMonth: summary.due_this_month,
    receivedThisMonth: summary.received_this_month
  } : {
    totalOpen: summaries.totalOpen,
    openCount: openReceivables.length,
    overdue: summaries.overdue,
    overdueCount: allReceivables.filter((item) => item.status === "overdue").length,
    dueThisMonth: summaries.dueThisMonth,
    receivedThisMonth: summaries.receivedThisMonth
  };

  const toggleSection = async (status) => {
    const willOpen = !openSections.has(status);
    if (willOpen && status === "paid" && !paidLoaded) {
      const loaded = await onExpandPaid?.();
      if (!loaded) return;
    }
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

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
          <p className="stat-value">{formatMoney(cards.totalOpen, language)}</p>
          <p className="stat-meta">{cards.openCount} {cards.openCount === 1 ? tt("receivables.openItem", "conta aberta") : tt("receivables.openItems", "contas abertas")}</p>
        </article>
        <article className="card stat-card stat-card-expense">
          <p className="stat-label">{tt("receivables.totalOverdue", "Total vencido")}</p>
          <p className="stat-value">{formatMoney(cards.overdue, language)}</p>
          <p className="stat-meta">{cards.overdueCount} {tt("receivables.overdue", "atrasadas")}</p>
        </article>
        <article className="card stat-card">
          <p className="stat-label">{tt("receivables.dueThisMonth", "A vencer este mês")}</p>
          <p className="stat-value">{formatMoney(cards.dueThisMonth, language)}</p>
          <p className="stat-meta">{formatMonthLabel(new Date().getFullYear(), new Date().getMonth() + 1, language)}</p>
        </article>
        <article className="card stat-card stat-card-balance">
          <p className="stat-label">{tt("receivables.receivedThisMonth", "Recebido no mês")}</p>
          <p className="stat-value">{formatMoney(cards.receivedThisMonth, language)}</p>
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
        </div>
        {hasActiveFilters && (
          <button className="invoice-filter-reset" type="button" onClick={() => setFilters({ search: "" })}>
            Limpar filtros
          </button>
        )}
      </div>}

      <div className="receivable-status-list">
        {STATUS_SECTIONS.map((status) => {
          const sectionGroups = groupsByStatus[status];
          const expanded = openSections.has(status);
          const count = status === "paid" && !paidLoaded
            ? Number(summary?.group_counts?.paid || 0)
            : sectionGroups.length;
          const panelId = `receivable-status-${status}`;
          return (
            <section className={`receivable-status-accordion ${status}`} key={status}>
              <button
                className="receivable-status-accordion-trigger"
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleSection(status)}
              >
                <ChevronDown size={18} />
                <span>{statusLabels[status]}</span>
                <small className="receivable-status-count">{count}</small>
              </button>
              {expanded && (
                <div id={panelId}>
                  {status === "paid" && paidLoading ? (
                    <p className="receivable-status-loading">{tt("receivables.loading", "Carregando...")}</p>
                  ) : sectionGroups.length ? (
                    <div className="receivable-list">
                      {sectionGroups.map((group) => (
                        <ReceivableSummaryCard
                          key={group.key}
                          group={group}
                          language={language}
                          tt={tt}
                          onOpen={setDetailsKey}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="receivable-status-empty">{tt("receivables.statusEmpty", "Nenhum recebível neste status.")}</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

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
