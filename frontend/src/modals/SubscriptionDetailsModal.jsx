import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Repeat2, X } from "lucide-react";

import { listCardSubscriptions } from "../api/api.js";
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

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const period = subscription ? (PERIOD_LABEL[subscription.billing_period] || PERIOD_LABEL.monthly) : null;
  const term = !subscription ? "" : subscription.term_kind === "months" && subscription.term_months
    ? copy(`${subscription.term_months} meses`, `${subscription.term_months} months`)
    : subscription.term_kind === "end_date" && subscription.term_end_date
      ? copy(`até ${formatDateShort(subscription.term_end_date, language)}`, `until ${formatDateShort(subscription.term_end_date, language)}`)
      : copy("Prazo indeterminado", "Open-ended");
  const categories = subscription?.categories?.length ? subscription.categories : subscription?.category ? [subscription.category] : [];

  return createPortal(
    <div className="modal-layer subscription-details-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={copy("Fechar detalhes da assinatura", "Close subscription details")} />
      <section className="modal-card subscription-details-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-details-title">
        <header>
          <span className="installment-card-icon"><Repeat2 size={18} /></span>
          <div>
            <h2 id="subscription-details-title">{subscription?.description || copy("Assinatura", "Subscription")}</h2>
            <p>{copy("Detalhes da assinatura", "Subscription details")}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={copy("Fechar", "Close")}><X size={18} /></button>
        </header>
        {!subscription && !missing ? (
          <div className="installment-page-loading"><Loader2 className="spin" size={20} /><span>{copy("Carregando assinatura...", "Loading subscription...")}</span></div>
        ) : missing ? (
          <p>{copy("Não foi possível carregar esta assinatura.", "Could not load this subscription.")}</p>
        ) : (
          <dl className="subscription-details-grid">
            <div>
              <dt>{copy("Valor", "Amount")}</dt>
              <dd>{formatMoney(subscription.amount, language)}</dd>
            </div>
            <div>
              <dt>{copy("Situação", "Status")}</dt>
              <dd>{subscription.active ? copy("Ativa", "Active") : copy("Encerrada", "Ended")}</dd>
            </div>
            <div>
              <dt>{copy("Cartão", "Card")}</dt>
              <dd><i className="subscription-card-dot" style={{ background: subscription.card_color || "#3B82F6" }} />{subscription.card_name}</dd>
            </div>
            <div>
              <dt>{copy("Periodicidade", "Billing period")}</dt>
              <dd>{language === "en-US" ? period[1] : period[0]}</dd>
            </div>
            <div>
              <dt>{copy("Duração", "Commitment")}</dt>
              <dd>{term}</dd>
            </div>
            <div>
              <dt>{copy("Dia da cobrança", "Charge day")}</dt>
              <dd>{copy(`Dia ${subscription.charge_day}`, `Day ${subscription.charge_day}`)}</dd>
            </div>
            <div>
              <dt>{copy("Início", "Start")}</dt>
              <dd>{formatDateShort(subscription.start_date, language)}</dd>
            </div>
            {chargeDate && (
              <div>
                <dt>{copy("Esta cobrança", "This charge")}</dt>
                <dd>{formatDateShort(chargeDate, language)}</dd>
              </div>
            )}
            <div>
              <dt>{copy("Categorias", "Categories")}</dt>
              <dd>
                <span className="installment-categories">
                  {categories.length ? categories.map((category) => (
                    <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>
                  )) : <span className="category-badge uncategorized">{copy("Sem categoria", "No category")}</span>}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>,
    document.body,
  );
}
