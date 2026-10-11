import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Eye, Filter, MoreVertical, Pencil, Plus, ReceiptText, TriangleAlert, UserPlus } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, formatMonthLabel } from "../utils/format.js";
import { receivableStatusText, todayIsoDate } from "../app/helpers.js";
import ReceivableDetailsModal from "../modals/ReceivableDetailsModal.jsx";
import ReceivablePersonDetailsModal from "../modals/ReceivablePersonDetailsModal.jsx";

export function originGroupKey(item) {
  if (item.record_kind === "linked_transaction") return `linked_transaction:${item.id}`;
  if (item.series_id) return `series:${item.series_id}`;
  const expense = item.linked_expense;
  if (expense?.source_type && expense?.source_id != null) {
    if (expense.source_type === "installment_item" && expense.purchase_id != null) return `purchase:${expense.purchase_id}:person:${item.person_id ?? item.person_name}`;
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
    return {
      key,
      items: sorted,
      isGroup: sorted.length > 1,
      person_id: sorted[0].person_id,
      person_name: sorted[0].person_name,
      description: sorted[0].description,
      linked_expense: sorted.find((item) => item.linked_expense)?.linked_expense || null,
      categories: sorted[0].categories?.length ? sorted[0].categories : sorted[0].category ? [sorted[0].category] : [],
      status: groupStatus(sorted),
      total_amount: totalAmount,
      received_amount: receivedAmount,
      remaining_amount: sorted.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
      linked_expense_amount: sorted.reduce((sum, item) => sum + Number(item.linked_expense_amount || 0), 0),
      linked_expense_excess_amount: sorted.reduce((sum, item) => sum + Number(item.linked_expense_excess_amount || 0), 0),
      due_date: sorted.reduce((min, item) => (!min || item.due_date < min ? item.due_date : min), null),
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

function initialsFor(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] || ""}${parts.length > 1 ? parts[parts.length - 1][0] || "" : ""}`.toLocaleUpperCase("pt-BR");
}

export function buildReceivablePeople(people, receivables) {
  const knownPeople = new Map((people || []).map((person) => [Number(person.id), person]));
  for (const item of receivables || []) {
    if (!knownPeople.has(Number(item.person_id))) knownPeople.set(Number(item.person_id), item.person || { id: item.person_id, name: item.person_name });
  }
  return [...knownPeople.values()].map((person) => {
    const items = (receivables || []).filter((item) => Number(item.person_id) === Number(person.id));
    const groups = buildReceivableGroups(items);
    const openGroups = groups.filter((group) => group.status !== "paid");
    const paidGroups = groups.filter((group) => group.status === "paid");
    const overdueGroups = groups.filter((group) => group.status === "overdue");
    const totalAmount = openGroups.reduce((sum, group) => sum + Number(group.total_amount || 0), 0);
    return {
      ...person,
      items,
      groups,
      open_groups: openGroups,
      paid_groups: paidGroups,
      open_count: openGroups.length,
      paid_count: paidGroups.length,
      overdue_count: overdueGroups.length,
      total_open: openGroups.reduce((sum, group) => sum + Number(group.remaining_amount || 0), 0),
      total_overdue: overdueGroups.reduce((sum, group) => sum + Number(group.remaining_amount || 0), 0),
      total_amount: totalAmount,
      received_amount: openGroups.reduce((sum, group) => sum + Number(group.received_amount || 0), 0),
      total_paid: paidGroups.reduce((sum, group) => sum + Number(group.total_amount || 0), 0),
      next_due: openGroups.reduce((next, group) => (!next || group.due_date < next ? group.due_date : next), null),
      last_paid_due: paidGroups.reduce((latest, group) => (!latest || group.due_date > latest ? group.due_date : latest), null)
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

function ReceivableSummaryCard({ group, language, tt, onOpen }) {
  const progress = Math.min((Number(group.received_amount || 0) / Math.max(Number(group.total_amount || 1), 1)) * 100, 100);
  return (
    <article className={`receivable-card receivable-summary-card card ${group.status}`} tabIndex={0} role="button" onClick={() => onOpen(group.key)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group.key); }
    }}>
      <header><div><h3>{group.person_name}</h3><p>{group.description}</p></div><span className={`due-badge compact ${group.status === "overdue" ? "danger" : group.status === "paid" ? "paid" : ""}`}>{receivableStatusText(group.status, language)}</span></header>
      <div className="receivable-summary-main">
        <div><small>{group.status === "paid" ? tt("receivables.total", "Total") : tt("receivables.remaining", "Restante")}</small><strong>{formatMoney(group.status === "paid" ? group.total_amount : group.remaining_amount, language)}</strong></div>
        <div><small>{tt("receivables.dueDate", "Vencimento")}</small><strong>{formatDateShort(group.due_date, language)}</strong></div>
      </div>
      <div className="receivable-card-progress">
        <div>
          <span>Progresso do recebimento</span>
          <strong>{group.status === "paid" ? "Concluído" : `${Math.round(progress)}% recebido`}</strong>
        </div>
        <div className="installment-progress receivable-progress" role="progressbar" aria-label="Progresso do recebimento" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </article>
  );
}

function ReceivablePersonCard({ person, language, scope, onDetails, onEdit }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const paid = scope === "paid";
  const progress = paid ? 100 : Math.min((Number(person.received_amount || 0) / Math.max(Number(person.total_amount || 1), 1)) * 100, 100);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);
  return (
    <article className="card receivable-person-card" tabIndex={0} role="button" onClick={() => onDetails(person)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onDetails(person); }
    }}>
      <header>
        <span className="receivable-person-avatar">{initialsFor(person.name)}</span>
        <div className="receivable-person-title"><h3>{person.name}</h3><p>{paid ? (person.paid_count === 1 ? "1 recebível pago" : `${person.paid_count} recebíveis pagos`) : (person.open_count === 1 ? "1 recebível em aberto" : `${person.open_count} recebíveis em aberto`)}</p></div>
        <div className="receivable-person-menu" ref={menuRef}>
          <button className="icon-btn" type="button" aria-label={`Opções de ${person.name}`} aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setMenuOpen((current) => !current); }}><MoreVertical size={18} /></button>
          {menuOpen && <div className="receivable-person-menu-popover">
            <button type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onDetails(person); }}><Eye size={15} /> Ver detalhes</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onEdit(person); }}><Pencil size={15} /> Editar pessoa</button>
          </div>}
        </div>
      </header>
      <div className="receivable-person-balance"><span>{paid ? "Total recebido" : "Total a receber"}</span><strong>{formatMoney(paid ? person.total_paid : person.total_open, language)}</strong></div>
      <div className="receivable-person-metrics">
        {paid ? <>
          <div><ReceiptText size={15} /><span>Contas quitadas</span><strong>{person.paid_count}</strong></div>
          <div><CalendarClock size={15} /><span>Último vencimento</span><strong>{person.last_paid_due ? formatDateShort(person.last_paid_due, language) : "—"}</strong></div>
        </> : <>
          <div className={person.total_overdue > 0 ? "danger" : ""}><TriangleAlert size={15} /><span>Vencido</span><strong>{formatMoney(person.total_overdue, language)}</strong></div>
          <div><CalendarClock size={15} /><span>Próximo vencimento</span><strong>{person.next_due ? formatDateShort(person.next_due, language) : "—"}</strong></div>
        </>}
      </div>
      <div className="receivable-card-progress">
        <div>
          <span>Progresso do recebimento</span>
          <strong>{paid ? "Concluído" : `${Math.round(progress)}% recebido`}</strong>
        </div>
        <div className="installment-progress receivable-progress" role="progressbar" aria-label="Progresso do recebimento" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </article>
  );
}

export default function ReceivablesPage({ receivables, people = [], linkedTransactions = [], summary = null, paidLoaded = false, paidLoading = false, onExpandPaid, onNew, onNewPerson, onEditPerson, onEdit, onEditLinkedTransaction, onPaid, onPayment, onDelete, onDeletePayment, onOverlayChange, actionOverlayOpen = false }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [filters, setFilters] = useState({ search: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [scope, setScope] = useState("pending");
  const [detailsKey, setDetailsKey] = useState(null);
  const [personDetailsId, setPersonDetailsId] = useState(null);
  const [personDetailsLoading, setPersonDetailsLoading] = useState(false);
  const today = todayIsoDate();
  const currentMonth = today.slice(0, 7);
  const linkedReceivables = linkedTransactions.map((transaction) => {
    const realized = transaction.date <= today;
    return { id: transaction.id, record_kind: "linked_transaction", transaction, person_name: tt("receivables.linkedEntry", "Lançamento associado"), description: transaction.description || tt("monthlyTable.noDescription", "Sem descrição"), total_amount: transaction.amount, received_amount: realized ? transaction.amount : 0, remaining_amount: realized ? 0 : transaction.amount, due_date: transaction.date, status: realized ? "paid" : "pending", category: transaction.category, categories: transaction.categories || [], linked_expense: transaction.linked_expense, payments: [] };
  });
  const normalizedReceivables = receivables.map((item) => ({ ...item, record_kind: "receivable" }));
  const personSummaries = useMemo(() => buildReceivablePeople(people, normalizedReceivables), [people, receivables]);
  const search = filters.search.trim().toLocaleLowerCase(language === "en-US" ? "en-US" : "pt-BR");
  const scopedPeople = personSummaries.filter((person) => scope === "paid" ? person.paid_count > 0 : person.open_count > 0 || person.groups.length === 0);
  const filteredPeople = scopedPeople.filter((person) => {
    if (!search || person.name.toLocaleLowerCase().includes(search)) return true;
    const groups = scope === "paid" ? person.paid_groups : person.open_groups;
    return groups.some((group) => group.items.some((item) => `${item.description} ${item.due_date}`.toLocaleLowerCase().includes(search)));
  });
  const linkedGroups = buildReceivableGroups(linkedReceivables.filter((item) => {
    const matchesScope = scope === "paid" ? item.status === "paid" : item.status !== "paid";
    return matchesScope && (!search || `${item.description} ${item.due_date}`.toLocaleLowerCase().includes(search));
  }));
  const allReceivables = [...normalizedReceivables, ...linkedReceivables];
  const openReceivables = allReceivables.filter((item) => item.status !== "paid");
  const detailsGroup = detailsKey ? buildReceivableGroups(allReceivables).find((group) => group.key === detailsKey) || null : null;
  const personDetails = personDetailsId ? personSummaries.find((person) => Number(person.id) === Number(personDetailsId)) || null : null;
  const personDetailGroups = personDetails ? (scope === "paid" ? personDetails.paid_groups : personDetails.open_groups) : [];
  const summaries = {
    totalOpen: openReceivables.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    overdue: allReceivables.filter((item) => item.status === "overdue").reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    dueThisMonth: openReceivables.filter((item) => item.due_date?.slice(0, 7) === currentMonth && item.due_date >= today).reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    receivedThisMonth: receivables.flatMap((item) => item.payments || []).filter((payment) => payment.paid_at?.slice(0, 7) === currentMonth).reduce((sum, payment) => sum + Number(payment.amount || 0), 0) + linkedReceivables.filter((item) => item.status === "paid" && item.due_date?.slice(0, 7) === currentMonth).reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  };
  const cards = summary ? { totalOpen: summary.total_open, openCount: summary.open_count, overdue: summary.total_overdue, overdueCount: summary.overdue_count, dueThisMonth: summary.due_this_month, receivedThisMonth: summary.received_this_month } : { totalOpen: summaries.totalOpen, openCount: openReceivables.length, overdue: summaries.overdue, overdueCount: allReceivables.filter((item) => item.status === "overdue").length, dueThisMonth: summaries.dueThisMonth, receivedThisMonth: summaries.receivedThisMonth };

  const openPersonDetails = async (person) => {
    setPersonDetailsId(person.id);
    if (scope !== "paid" || paidLoaded || !onExpandPaid) return;
    setPersonDetailsLoading(true);
    try { await onExpandPaid(); } finally { setPersonDetailsLoading(false); }
  };
  const selectScope = async (nextScope) => {
    setScope(nextScope);
    setPersonDetailsId(null);
    setDetailsKey(null);
    if (nextScope === "paid" && !paidLoaded && !paidLoading) await onExpandPaid?.();
  };
  useEffect(() => {
    onOverlayChange?.(Boolean(detailsGroup || personDetails));
    return () => onOverlayChange?.(false);
  }, [detailsGroup, personDetails, onOverlayChange]);
  useEffect(() => { if (detailsKey && !detailsGroup) setDetailsKey(null); }, [detailsKey, detailsGroup]);

  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("receivables.title", "Recebíveis")}</p><h2>{tt("receivables.heading", "Recebíveis por pessoa")}</h2></div>
        <div className="view-actions receivable-view-actions">
          <button className="btn btn-ghost" type="button" onClick={onNewPerson}><UserPlus size={16} /> {language === "en-US" ? "New person" : "Nova pessoa"}</button>
          <button className={`btn btn-ghost filter-toggle ${filterOpen || search ? "active" : ""}`} type="button" onClick={() => setFilterOpen((current) => !current)}><Filter size={16} /> {tt("receivables.filter", "Filtrar")}</button>
          <button className="btn btn-primary" type="button" onClick={onNew}><Plus size={16} /> {tt("receivables.new", "Nova conta")}</button>
        </div>
      </div>
      <section className="summary-grid receivable-summary">
        <article className="card stat-card stat-card-income"><p className="stat-label">{tt("receivables.totalOpen", "Total a receber")}</p><p className="stat-value">{formatMoney(cards.totalOpen, language)}</p><p className="stat-meta">{cards.openCount} {cards.openCount === 1 ? tt("receivables.openItem", "conta aberta") : tt("receivables.openItems", "contas abertas")}</p></article>
        <article className="card stat-card stat-card-expense"><p className="stat-label">{tt("receivables.totalOverdue", "Total vencido")}</p><p className="stat-value">{formatMoney(cards.overdue, language)}</p><p className="stat-meta">{cards.overdueCount} {tt("receivables.overdue", "atrasadas")}</p></article>
        <article className="card stat-card"><p className="stat-label">{tt("receivables.dueThisMonth", "A vencer este mês")}</p><p className="stat-value">{formatMoney(cards.dueThisMonth, language)}</p><p className="stat-meta">{formatMonthLabel(new Date().getFullYear(), new Date().getMonth() + 1, language)}</p></article>
        <article className="card stat-card stat-card-balance"><p className="stat-label">{tt("receivables.receivedThisMonth", "Recebido no mês")}</p><p className="stat-value">{formatMoney(cards.receivedThisMonth, language)}</p><p className="stat-meta">{tt("receivables.realizedIncome", "Ganho realizado")}</p></article>
      </section>
      <div className="receivable-scope-tabs" role="tablist" aria-label="Situação dos recebíveis">
        <button className={scope === "pending" ? "active" : ""} type="button" role="tab" aria-selected={scope === "pending"} onClick={() => selectScope("pending")}>
          Pendentes <span>{Number(summary?.group_counts?.overdue || 0) + Number(summary?.group_counts?.pending || 0) + Number(summary?.group_counts?.partial || 0)}</span>
        </button>
        <button className={scope === "paid" ? "active" : ""} type="button" role="tab" aria-selected={scope === "paid"} onClick={() => selectScope("paid")}>
          Pagos <span>{Number(summary?.group_counts?.paid || 0)}</span>
        </button>
      </div>
      {filterOpen && <div className="invoice-filter receivable-filter">
        <div className="invoice-filter-head"><span><Filter size={15} /> {tt("receivables.filter", "Filtrar pessoas e recebíveis")}</span><small>{filteredPeople.length} de {scopedPeople.length}</small></div>
        <div className="invoice-filter-grid receivable-filter-grid"><label className="invoice-filter-search"><span>{tt("receivables.search", "Pessoa ou descrição")}</span><input value={filters.search} onChange={(event) => setFilters({ search: event.target.value })} placeholder={tt("receivables.searchPlaceholder", "Buscar por pessoa, descrição ou data")} /></label></div>
        {search && <button className="invoice-filter-reset" type="button" onClick={() => setFilters({ search: "" })}>Limpar filtros</button>}
      </div>}
      <section className="receivable-people-section">
        <header className="receivable-people-heading"><div><span><ReceiptText size={17} /> {scope === "paid" ? "Recebíveis pagos" : "Recebíveis pendentes"}</span><p>{scope === "paid" ? "Histórico de valores já recebidos, agrupado por pessoa." : "Valores em aberto, parciais ou vencidos, agrupados por pessoa."}</p></div><small>{filteredPeople.length} {filteredPeople.length === 1 ? "pessoa" : "pessoas"}</small></header>
        {scope === "paid" && paidLoading ? <div className="receivable-people-empty"><strong>Carregando recebíveis pagos...</strong></div> : filteredPeople.length ? <div className="receivable-people-grid">{filteredPeople.map((person) => <ReceivablePersonCard key={person.id} person={person} language={language} scope={scope} onDetails={openPersonDetails} onEdit={onEditPerson} />)}</div> : <div className="receivable-people-empty"><ReceiptText size={26} /><strong>{scope === "paid" ? "Nenhum recebível pago" : "Nenhum recebível pendente"}</strong><p>{search ? "Nenhum resultado corresponde ao filtro informado." : scope === "paid" ? "Os recebíveis quitados aparecerão aqui." : "Cadastre uma nova conta a receber para começar."}</p>{scope === "pending" && !search && <button className="btn btn-primary" type="button" onClick={onNew}><Plus size={16} /> Nova conta</button>}</div>}
      </section>
      {linkedGroups.length > 0 && <section className="receivable-linked-section"><header className="receivable-people-heading"><div><span>Lançamentos associados</span><p>Entradas vinculadas diretamente a gastos, sem uma pessoa cadastrada.</p></div><small>{linkedGroups.length}</small></header><div className="receivable-list">{linkedGroups.map((group) => <ReceivableSummaryCard key={group.key} group={group} language={language} tt={tt} onOpen={setDetailsKey} />)}</div></section>}
      <button className="fab" onClick={onNew} aria-label="Criar recebível"><Plus /></button>
      {personDetails && <ReceivablePersonDetailsModal person={personDetails} groups={personDetailGroups} scope={scope} loading={personDetailsLoading || (scope === "paid" && paidLoading)} onClose={() => setPersonDetailsId(null)} onEdit={(person) => { setPersonDetailsId(null); onEditPerson(person); }} onOpenReceivable={(key) => { setPersonDetailsId(null); setDetailsKey(key); }} />}
      {detailsGroup && <ReceivableDetailsModal group={detailsGroup} busy={actionOverlayOpen} onClose={() => setDetailsKey(null)} onEdit={onEdit} onEditLinkedTransaction={onEditLinkedTransaction} onPaid={onPaid} onPayment={onPayment} onDelete={onDelete} onDeletePayment={onDeletePayment} />}
    </section>
  );
}
