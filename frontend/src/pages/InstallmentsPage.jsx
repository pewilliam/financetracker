import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, CreditCard, Eye, Plus } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

function isPaidOff(purchase) {
  return purchase.installment_count > 0 && purchase.paid_installments === purchase.installment_count;
}

function progressOf(purchase) {
  return purchase.installment_count ? purchase.paid_installments / purchase.installment_count : 0;
}

function sortInstallments(items, sortBy, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const valueFor = (purchase) => {
    if (sortBy === "amount") return Number(purchase.total_amount || 0);
    if (sortBy === "progress") return progressOf(purchase);
    return new Date(purchase.created_at || 0).getTime();
  };

  return [...items].sort((first, second) => {
    const difference = valueFor(first) - valueFor(second);
    return difference ? difference * direction : (Number(second.id) - Number(first.id));
  });
}

export default function InstallmentsPage({ installments, onNew, onDetails }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [expandedGroups, setExpandedGroups] = useState({ inProgress: false, paidOff: false });
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const groups = [
    {
      id: "inProgress",
      label: tt("installments.inProgress", "Em andamento"),
      empty: tt("installments.noInProgress", "Nenhum parcelamento em andamento."),
      items: installments.filter((purchase) => !isPaidOff(purchase))
    },
    {
      id: "paidOff",
      label: tt("installments.paidOff", "Quitados"),
      empty: tt("installments.noPaidOff", "Nenhum parcelamento quitado."),
      items: installments.filter(isPaidOff)
    }
  ];

  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("installments.title", "Compras parceladas")}</p><h2>{tt("installments.installments", "Parcelamentos")}</h2></div>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> {tt("installments.installmentPurchase", "Compra parcelada")}</button>
      </div>
      {installments.length ? (
        <div className="installment-list">
          <div className="installment-toolbar">
            <label className="installment-sort-control">
              <span>{tt("installments.sortBy", "Ordenar por")}</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="createdAt">{tt("installments.registrationDate", "Data de cadastro")}</option>
                <option value="amount">{tt("installments.amount", "Valor")}</option>
                <option value="progress">{tt("installments.sortProgress", "Progresso")}</option>
              </select>
            </label>
            <button
              className="icon-btn installment-sort-direction"
              type="button"
              onClick={() => setSortDirection((current) => current === "desc" ? "asc" : "desc")}
              aria-label={sortDirection === "desc" ? tt("installments.sortDescending", "Ordem decrescente") : tt("installments.sortAscending", "Ordem crescente")}
              title={sortDirection === "desc" ? tt("installments.sortDescending", "Ordem decrescente") : tt("installments.sortAscending", "Ordem crescente")}
            >
              {sortDirection === "desc" ? <ArrowDown size={17} /> : <ArrowUp size={17} />}
            </button>
          </div>
          <div className="installment-groups">
            {groups.map((group) => {
              const expanded = expandedGroups[group.id];
              const sortedItems = sortInstallments(group.items, sortBy, sortDirection);
              return (
                <section className={`installment-group ${expanded ? "expanded" : "collapsed"}`} key={group.id}>
                  <button className="installment-group-toggle" type="button" onClick={() => toggleGroup(group.id)} aria-expanded={expanded}>
                    <div className="installment-group-head">
                      <h3>{group.label}</h3>
                      <small>{group.items.length}</small>
                    </div>
                    <ChevronDown size={18} />
                  </button>
                  {expanded && (
                    sortedItems.length ? (
                      <div className="installment-grid">
                        {sortedItems.map((purchase) => {
                          const pct = progressOf(purchase) * 100;
                          const next = purchase.next_installment?.invoice;
                          return (
                            <article className="installment-card" key={purchase.id}>
                              <header>
                                <h3><CreditCard size={18} /> {purchase.description}</h3>
                                {isPaidOff(purchase) && <span className="paid-pill">{tt("installments.paidOffSingle", "QUITADO")}</span>}
                              </header>
                              {(purchase.categories?.length ? purchase.categories : purchase.category ? [purchase.category] : []).map((category) => (
                                <span className="category-badge" style={{ "--category-color": category.color }} key={category.id}>{category.name}</span>
                              ))}
                              <p>{formatMoney(purchase.total_amount)} • {purchase.installment_count}x {formatMoney(purchase.installment_value)}</p>
                              <div className="installment-progress"><span style={{ width: `${pct}%` }} /></div>
                              <strong>{tt("installments.progress", "Progresso:")} {purchase.paid_installments} / {purchase.installment_count}</strong>
                              <p>{tt("installments.paid", "Pago:")} {formatMoney(purchase.paid_amount)} • {tt("installments.remaining", "Restante:")} {formatMoney(purchase.remaining_amount)}</p>
                              {!isPaidOff(purchase) && <p>{tt("installments.nextInstallment", "Próxima parcela:")} {next ? `${next.name} — ${tt("installments.due", "vence")} ${formatDateShort(next.due_date)}` : tt("installments.removedInvoice", "Fatura removida — realocar")}</p>}
                              <button className="btn btn-ghost" onClick={() => onDetails(purchase.id)}><Eye size={16} /> {tt("installments.details", "Detalhes")}</button>
                            </article>
                          );
                        })}
                      </div>
                    ) : <div className="installment-group-empty">{group.empty}</div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma compra parcelada.</h3><p>Use Compra parcelada para distribuir valores nas faturas.</p></div>}
    </section>
  );
}


