import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, CreditCard,
  Loader2, Repeat2, Tag, X, XCircle
} from "lucide-react";

import { listCardSubscriptions } from "../api/api.js";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

const PERIOD_LABEL = {
  monthly: ["Mensal", "Monthly"],
  bimonthly: ["Bimestral", "Every 2 months"],
  quarterly: ["Trimestral", "Quarterly"],
  semiannual: ["Semestral", "Semiannual"],
  annual: ["Anual", "Annual"],
  custom: ["Personalizada", "Custom"],
};

export default function SubscriptionDetailsModal({ subscriptionId, chargeDate, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const closeButtonRef = useRef(null);
  const [subscription, setSubscription] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCardSubscriptions()
      .then((items) => {
        if (cancelled) return;
        const found = (Array.isArray(items) ? items : []).find((item) => item.id === subscriptionId);
        setSubscription(found || null);
        setMissing(!found);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => { cancelled = true; };
  }, [subscriptionId]);

  useModalLifecycle({ onClose, initialFocusRef: closeButtonRef });

  const period = subscription ? (PERIOD_LABEL[subscription.billing_period] || PERIOD_LABEL.monthly) : null;
  const term = !subscription ? "" : subscription.term_kind === "months" && subscription.term_months
    ? copy(`${subscription.term_months} meses`, `${subscription.term_months} months`)
    : subscription.term_kind === "end_date" && subscription.term_end_date
      ? copy(`até ${formatDateShort(subscription.term_end_date, language)}`, `until ${formatDateShort(subscription.term_end_date, language)}`)
      : copy("Prazo indeterminado", "Open-ended");
  const categories = subscription?.categories?.length ? subscription.categories : subscription?.category ? [subscription.category] : [];
  const StatusIcon = subscription?.active ? CheckCircle2 : XCircle;
  const periodLabel = period ? (language === "en-US" ? period[1] : period[0]) : "";

  return createPortal(
    <div className="modal-layer subscription-details-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={copy("Fechar detalhes da assinatura", "Close subscription details")} />
      <section className="modal-card subscription-details-modal" style={{ "--subscription-card-color": subscription?.card_color || "var(--primary)" }} role="dialog" aria-modal="true" aria-labelledby="subscription-details-title">
        <header className="subscription-details-header">
          <span className="subscription-details-icon"><Repeat2 size={20} /></span>
          <div className="subscription-details-heading">
            <p className="eyebrow">{copy("Detalhes da assinatura", "Subscription details")}</p>
            <h2 id="subscription-details-title">{subscription?.description || copy("Assinatura", "Subscription")}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} aria-label={copy("Fechar", "Close")}><X size={18} /></button>
        </header>
        <div className="subscription-details-body">
          {!subscription && !missing ? (
            <div className="subscription-details-state"><Loader2 className="spin" size={22} /><span>{copy("Carregando assinatura...", "Loading subscription...")}</span></div>
          ) : missing ? (
            <div className="subscription-details-state error"><AlertTriangle size={22} /><strong>{copy("Não foi possível carregar esta assinatura.", "Could not load this subscription.")}</strong><span>{copy("Feche esta janela e tente novamente.", "Close this window and try again.")}</span></div>
          ) : (
            <>
              <section className="subscription-details-overview" aria-label={copy("Resumo da assinatura", "Subscription summary")}>
                <div><small>{copy("Valor da assinatura", "Subscription amount")}</small><strong>{formatMoney(subscription.amount, language)}</strong><span><Repeat2 size={13} /> {periodLabel}</span></div>
                <span className={`subscription-details-status ${subscription.active ? "active" : "ended"}`}><StatusIcon size={15} />{subscription.active ? copy("Ativa", "Active") : copy("Encerrada", "Ended")}</span>
              </section>

              <dl className="subscription-details-grid">
                <div className="subscription-detail-field subscription-detail-card">
                  <dt><CreditCard size={15} /> {copy("Cartão", "Card")}</dt>
                  <dd><i className="subscription-card-dot" />{subscription.card_name}</dd>
                </div>
                <div className="subscription-detail-field">
                  <dt><Repeat2 size={15} /> {copy("Periodicidade", "Billing period")}</dt>
                  <dd>{periodLabel}</dd>
                </div>
                <div className="subscription-detail-field">
                  <dt><CalendarClock size={15} /> {copy("Duração", "Commitment")}</dt>
                  <dd>{term}</dd>
                </div>
                <div className="subscription-detail-field">
                  <dt><CalendarDays size={15} /> {copy("Dia da cobrança", "Charge day")}</dt>
                  <dd>{copy(`Dia ${subscription.charge_day}`, `Day ${subscription.charge_day}`)}</dd>
                </div>
                <div className="subscription-detail-field">
                  <dt><CalendarDays size={15} /> {copy("Início", "Start")}</dt>
                  <dd>{formatDateShort(subscription.start_date, language)}</dd>
                </div>
                {chargeDate && (
                  <div className="subscription-detail-field">
                    <dt><CalendarDays size={15} /> {copy("Esta cobrança", "This charge")}</dt>
                    <dd>{formatDateShort(chargeDate, language)}</dd>
                  </div>
                )}
                <div className="subscription-detail-field subscription-detail-categories">
                  <dt><Tag size={15} /> {categories.length === 1 ? copy("Categoria", "Category") : copy("Categorias", "Categories")}</dt>
                  <dd>
                    <span className="installment-categories">
                      {categories.length ? categories.map((category) => (
                        <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>
                      )) : <span className="category-badge uncategorized">{copy("Sem categoria", "No category")}</span>}
                    </span>
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
