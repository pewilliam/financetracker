import { useEffect, useState } from "react";
import { AlertTriangle, EllipsisVertical, Loader2, Pencil, Plus, Repeat2, X } from "lucide-react";

import { listCardSubscriptions } from "../api/api.js";
import InvoiceEntryModal from "../modals/InvoiceEntryModal.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

function subscriptionCategories(item) {
  return item.categories?.length ? item.categories : item.category ? [item.category] : [];
}

export default function SubscriptionsPage({ revision = 0, cards = [], categories = [], onCreateCategory, onNew, onSave, onCancel }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("active");
  const [ending, setEnding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCardSubscriptions()
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data) ? data : []);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [revision]);

  const periodLabel = (period) => ({
    monthly: copy("Mensal", "Monthly"),
    bimonthly: copy("Bimestral", "Every 2 months"),
    quarterly: copy("Trimestral", "Quarterly"),
    semiannual: copy("Semestral", "Semiannual"),
    annual: copy("Anual", "Annual"),
    custom: copy("Personalizada", "Custom"),
  }[period] || copy("Mensal", "Monthly"));
  const frequencyLabel = (item) => {
    const interval = Number(item.billing_interval_months || 1);
    if (interval === 1) return copy("por mês", "per month");
    if (interval === 12) return copy("por ano", "per year");
    return copy(`a cada ${interval} meses`, `every ${interval} months`);
  };
  const termLabel = (item) => {
    if (item.term_kind === "months" && item.term_months) {
      return copy(`${item.term_months} meses`, `${item.term_months} months`);
    }
    if (item.term_kind === "end_date" && item.term_end_date) {
      return copy(`até ${formatDateShort(item.term_end_date, language)}`, `until ${formatDateShort(item.term_end_date, language)}`);
    }
    return copy("Prazo indeterminado", "Open-ended");
  };
  const activeCount = items.filter((item) => item.active).length;
  const endedCount = items.length - activeCount;
  const visible = items.filter((item) => (tab === "active" ? item.active : !item.active));
  const openEditor = (item) => {
    if (item.active) setEditing(item);
  };

  return (
    <section className="installments-page subscriptions-page">
      <div className="installments-page-head">
        <div>
          <p className="eyebrow">{copy("Cobranças recorrentes", "Recurring charges")}</p>
          <h1>{copy("Assinaturas", "Subscriptions")}</h1>
          <p>{copy(
            "A periodicidade define a frequência da cobrança e a duração define até quando o compromisso existe. A cobrança fica prevista até o dia em que é lançada e só então entra no limite.",
            "Billing period sets how often the card is charged, and the commitment sets how long it lasts. A charge stays forecast until its date, and only then uses the limit.",
          )}</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={onNew}><Plus size={16} /> {copy("Nova assinatura", "New subscription")}</button>
      </div>

      {loadError && !items.length ? (
        <div className="installment-empty-results primary-empty error">
          <span><AlertTriangle size={26} /></span>
          <h3>{copy("Não foi possível carregar as assinaturas", "Could not load subscriptions")}</h3>
          <p>{copy("Confira sua conexão e tente atualizar os dados.", "Check your connection and try again.")}</p>
        </div>
      ) : (
        <>
          <nav className="installment-tabs" role="tablist" aria-label={copy("Situação das assinaturas", "Subscription status")}>
            <button type="button" role="tab" aria-selected={tab === "active"} className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>
              {copy("Ativas", "Active")} <span>{activeCount}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "ended"} className={tab === "ended" ? "active" : ""} onClick={() => setTab("ended")}>
              {copy("Encerradas", "Ended")} <span>{endedCount}</span>
            </button>
          </nav>

          {loading && !items.length ? (
            <div className="installment-page-loading"><Loader2 className="spin" size={22} /><span>{copy("Carregando assinaturas...", "Loading subscriptions...")}</span></div>
          ) : visible.length ? (
            <div className="installment-grid">
              {visible.map((item) => {
                const itemCategories = subscriptionCategories(item);
                const interactive = Boolean(item.active);
                return (
                  <article
                    className={`installment-card ${interactive ? "" : "is-paid is-static"}`}
                    key={item.id}
                    tabIndex={interactive ? 0 : undefined}
                    role={interactive ? "button" : undefined}
                    onClick={() => openEditor(item)}
                    onKeyDown={(event) => {
                      if (!interactive) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEditor(item);
                      }
                    }}
                  >
                    <header>
                      <span className="installment-card-icon"><Repeat2 size={18} /></span>
                      <div className="installment-card-title">
                        <h3>{item.description}</h3>
                        <span className="installment-categories">
                          {itemCategories.length ? itemCategories.map((category) => (
                            <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>
                          )) : <span className="category-badge uncategorized">{copy("Sem categoria", "No category")}</span>}
                        </span>
                      </div>
                      {interactive && (
                        <details className="installment-menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                          <summary className="icon-btn small" aria-label={copy(`Ações de ${item.description}`, `Actions for ${item.description}`)} title={copy("Mais ações", "More actions")}>
                            <EllipsisVertical size={17} />
                          </summary>
                          <div className="installment-menu-popover">
                            <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openEditor(item); }}>
                              <Pencil size={14} /> {copy("Editar", "Edit")}
                            </button>
                            <button className="danger-text" type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setEnding(item); }}>
                              <X size={14} /> {copy("Encerrar", "End")}
                            </button>
                          </div>
                        </details>
                      )}
                    </header>
                    <div className="installment-main-value">
                      <strong>{formatMoney(item.amount, language)} <small>{frequencyLabel(item)}</small></strong>
                      <span><i className="subscription-card-dot" style={{ background: item.card_color || "#3B82F6" }} />{item.card_name} · {termLabel(item)}</span>
                    </div>
                    <div className="installment-next">
                      <div>
                        <small>{copy("Dia da cobrança", "Charge day")}</small>
                        <strong>{copy(`Dia ${item.charge_day}`, `Day ${item.charge_day}`)}</strong>
                        <span>{periodLabel(item.billing_period)}</span>
                      </div>
                      <span className={`installment-status ${item.active ? "success" : ""}`}>{item.active ? copy("Ativa", "Active") : copy("Encerrada", "Ended")}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="installment-empty-results primary-empty">
              <span><Repeat2 size={22} /></span>
              <h3>{tab === "active"
                ? copy("Nenhuma assinatura ativa", "No active subscriptions")
                : copy("Nenhuma assinatura encerrada", "No ended subscriptions")}</h3>
              <p>{tab === "active"
                ? copy("Cadastre uma assinatura para ver a cobrança nas próximas faturas.", "Add a subscription to see the charge on upcoming invoices.")
                : copy("As assinaturas que você encerrar aparecem aqui.", "Subscriptions you end show up here.")}</p>
              {tab === "active" && (
                <button className="btn btn-primary" type="button" onClick={onNew}><Plus size={16} /> {copy("Nova assinatura", "New subscription")}</button>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <InvoiceEntryModal
          key={editing.id}
          mode="subscription"
          subscription={editing}
          cards={cards}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onSave={async (payload) => {
            await onSave?.(editing.id, payload);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {ending && (
        <div className="modal-layer">
          <button className="modal-backdrop" type="button" onClick={busy ? undefined : () => setEnding(null)} aria-label={copy("Fechar", "Close")} />
          <form
            className="modal-card invoice-subscription-end"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!onCancel || busy) return;
              setBusy(true);
              try {
                await onCancel(ending.id);
                setEnding(null);
              } catch {
                // A página mostra o erro.
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{copy("Encerrar recorrência", "End recurring charge")}</h2>
            <p>{copy(
              `${ending.description} deixa de entrar nas próximas faturas. O que já virou item da fatura permanece.`,
              `${ending.description} will stop appearing on upcoming invoices. Charges already posted stay on the invoice.`,
            )}</p>
            <footer className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setEnding(null)} disabled={busy}>{copy("Cancelar", "Cancel")}</button>
              <button className="btn btn-primary" type="submit" disabled={busy}>{copy("Encerrar", "End")}</button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
