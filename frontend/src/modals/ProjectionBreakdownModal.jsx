import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CalendarDays, ChevronDown, CreditCard, HandCoins, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";
import "./financeSheets.css";

function ProjectionGroup({ color, icon, label, hint, amount, positive, language, open, onToggle, children }) {
  return (
    <article className="finance-accordion" style={{ "--finance-accent": color }}>
      <button className="finance-accordion-button" type="button" aria-expanded={open} onClick={onToggle}>
        <i className="finance-accordion-icon">{icon}</i>
        <span className="finance-accordion-copy"><strong>{label}</strong><small>{hint}</small></span>
        <strong className={`finance-accordion-amount ${positive ? "finance-positive" : "finance-negative"}`}>{formatMoney(amount, language)}</strong>
        <ChevronDown className="finance-accordion-chevron" size={16} />
      </button>
      {open && <div className="finance-accordion-panel">{children}</div>}
    </article>
  );
}

export default function ProjectionBreakdownModal({ summary, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt) => (language === "en-US" ? t(`dashboard.projectionBreakdown.${key}`) : pt);
  const closeButtonRef = useRef(null);
  const [openSection, setOpenSection] = useState(null);
  const receivables = summary?.projection_receivables || [];
  const invoices = summary?.projection_invoices || [];
  const receivableTotal = Number(summary?.planned_receivables_total || 0);
  const invoiceTotal = Number(summary?.open_invoices_projected_total || 0);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const countHint = (count, ptSingular, ptPlural, enSingular, enPlural) => (
    language === "en-US"
      ? `${count} ${count === 1 ? enSingular : enPlural}`
      : `${count} ${count === 1 ? ptSingular : ptPlural}`
  );
  const toggle = (section) => setOpenSection((current) => current === section ? null : section);

  return createPortal(
    <div className="finance-sheet-layer">
      <button className="finance-sheet-backdrop" type="button" onClick={onClose} aria-label={tt("close", "Fechar detalhamento")} />
      <section className="finance-sheet finance-sheet--projection" role="dialog" aria-modal="true" aria-labelledby="projection-sheet-title">
        <div className="finance-sheet-grabber" aria-hidden="true" />
        <header className="finance-sheet-header">
          <i className="finance-sheet-heading-icon"><CalendarClock size={20} /></i>
          <div className="finance-sheet-heading">
            <small>{tt("eyebrow", "Projeção")}</small>
            <h2 id="projection-sheet-title">{tt("title", "Fechamento previsto")}</h2>
          </div>
          <button ref={closeButtonRef} className="finance-sheet-close" type="button" onClick={onClose} aria-label={tt("close", "Fechar")}><X size={18} /></button>
        </header>

        <div className="finance-sheet-scroll">
          <div className="finance-sheet-summary finance-sheet-summary--three">
            <div><small>{tt("income", "Ganhos confirmados")}</small><strong className="finance-positive">{formatMoney(summary?.total_income, language)}</strong></div>
            <div><small>{tt("expenses", "Gastos confirmados")}</small><strong className="finance-negative">{formatMoney(summary?.total_expenses, language)}</strong></div>
            <div><small>{tt("realized", "Fechamento pelos lançamentos")}</small><strong>{formatMoney(summary?.transactions_projected_closing, language)}</strong></div>
          </div>

          <div className="finance-sheet-body">
            <ProjectionGroup
            color="var(--income)"
            icon={<HandCoins size={17} />}
            label={tt("receivables", "Valores a receber")}
            hint={receivables.length ? countHint(receivables.length, "recebível", "recebíveis", "receivable", "receivables") : tt("emptyReceivables", "Nenhum recebível previsto neste fechamento.")}
            amount={receivableTotal}
            positive
            language={language}
            open={openSection === "receivables"}
            onToggle={() => toggle("receivables")}
          >
            {receivables.length ? receivables.map((item) => (
              <article className="finance-detail-row" key={`${item.due_date}-${item.description}-${item.amount}`}>
                <i className="finance-detail-icon"><HandCoins size={17} /></i>
                <span className="finance-detail-copy">
                  <strong>{item.origin || item.description}</strong>
                  <small><CalendarDays size={12} /> {formatDateShort(item.due_date, language)}{item.origin ? <><em>·</em>{item.description}</> : null}</small>
                </span>
                <strong className="finance-detail-amount finance-positive">{formatMoney(item.amount, language)}</strong>
              </article>
            )) : <p className="finance-accordion-empty">{tt("emptyReceivables", "Nenhum recebível previsto neste fechamento.")}</p>}
            </ProjectionGroup>

            <ProjectionGroup
            color="var(--expense)"
            icon={<CreditCard size={17} />}
            label={tt("invoices", "Faturas previstas")}
            hint={invoices.length ? countHint(invoices.length, "fatura", "faturas", "invoice", "invoices") : tt("emptyInvoices", "Nenhuma fatura aberta com valor previsto neste fechamento.")}
            amount={invoiceTotal}
            positive={false}
            language={language}
            open={openSection === "invoices"}
            onToggle={() => toggle("invoices")}
          >
            {invoices.length ? invoices.map((item) => (
              <article className="finance-detail-row is-expense" key={`${item.card_name}-${item.payment_date}-${item.difference}`}>
                <i className="finance-detail-icon"><CreditCard size={17} /></i>
                <span className="finance-detail-copy">
                  <strong>{item.card_name}</strong>
                  <small>
                    {tt("currentTotal", "Fatura hoje")} {formatMoney(item.current_total, language)} <em>·</em>
                    {tt("projectedTotal", "Com previsão")} {formatMoney(item.projected_total, language)} <em>·</em>
                    <CalendarDays size={12} /> {formatDateShort(item.payment_date, language)}
                  </small>
                </span>
                <strong className="finance-detail-amount finance-negative">{formatMoney(item.difference, language)}</strong>
              </article>
            )) : <p className="finance-accordion-empty">{tt("emptyInvoices", "Nenhuma fatura aberta com valor previsto neste fechamento.")}</p>}
            </ProjectionGroup>
          </div>

          <footer className="finance-sheet-total">
            <span>{tt("total", "Fechamento previsto")}</span>
            <strong>{formatMoney(summary?.projected_closing, language)}</strong>
          </footer>
        </div>
      </section>
    </div>,
    document.body,
  );
}
