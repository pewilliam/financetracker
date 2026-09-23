import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Repeat2 } from "lucide-react";

import { listCardSubscriptions } from "../api/api.js";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";

export default function SubscriptionsPage({ revision = 0, onNew, onCancel }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("active");
  const [ending, setEnding] = useState(null);
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

  const activeCount = items.filter((item) => item.active).length;
  const endedCount = items.length - activeCount;
  const visible = items.filter((item) => (tab === "active" ? item.active : !item.active));

  return (
    <section className="installments-page subscriptions-page">
      <div className="installments-page-head">
        <div>
          <p className="eyebrow">{copy("Cobranças recorrentes", "Recurring charges")}</p>
          <h1>{copy("Assinaturas", "Subscriptions")}</h1>
          <p>{copy(
            "A cobrança aparece nas próximas faturas como previsão e só entra no limite do cartão no dia em que é lançada.",
            "The charge shows on upcoming invoices as a forecast and counts toward the card limit only on the day it posts.",
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
            <div className="subscription-list">
              {visible.map((item) => {
                const categories = (item.categories || []).map((category) => category.name).filter(Boolean);
                return (
                  <article className="subscription-row" key={item.id}>
                    <span className="subscription-dot" style={{ background: item.card_color || "#3B82F6" }} aria-hidden="true" />
                    <div className="subscription-main">
                      <strong>{item.description}</strong>
                      <small>
                        {item.card_name}
                        {" · "}
                        {copy(`dia ${item.charge_day}`, `day ${item.charge_day}`)}
                        {categories.length ? ` · ${categories.join(", ")}` : ""}
                      </small>
                    </div>
                    <b>{formatMoney(item.amount, language)}</b>
                    {item.active && (
                      <button className="btn btn-ghost" type="button" onClick={() => setEnding(item)}>
                        {copy("Encerrar", "End")}
                      </button>
                    )}
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
