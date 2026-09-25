import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CalendarDays, ChevronDown, CreditCard, HandCoins, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

function BreakdownGroup({ color, icon, label, hint, amount, tone, open, onToggle, children }) {
  return (
    <article className="day-wallet-group" style={{ "--category-color": color }}>
      <button className="day-wallet-trigger" type="button" aria-expanded={open} onClick={onToggle}>
        <i>{icon}</i>
        <span>
          <strong>{label}</strong>
          <small>{hint}</small>
        </span>
        <strong className={tone}>{formatMoney(amount)}</strong>
        <ChevronDown size={16} />
      </button>
      {open && <div className="day-wallet-panel">{children}</div>}
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
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggle = (section) => setOpenSection((current) => current === section ? null : section);
  const countHint = (count, ptSingular, ptPlural, enSingular, enPlural) => (
    language === "en-US"
      ? `${count} ${count === 1 ? enSingular : enPlural}`
      : `${count} ${count === 1 ? ptSingular : ptPlural}`
  );

  return createPortal(
    <div className="modal-layer categories-detail-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={tt("close", "Fechar detalhamento")} />
      <section
        className="modal-card categories-detail-modal projection-breakdown-modal"
        style={{ "--category-color": "var(--primary)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="projection-breakdown-title"
      >
        <header className="categories-detail-header">
          <i><CalendarClock size={20} /></i>
          <div>
            <p className="eyebrow">{tt("eyebrow", "Projeção")}</p>
            <h2 id="projection-breakdown-title">{tt("title", "Fechamento previsto")}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} aria-label={tt("close", "Fechar")}><X size={18} /></button>
        </header>

        <div className="categories-detail-summary">
          <div>
            <small>{tt("income", "Ganhos confirmados")}</small>
            <strong className="income">{formatMoney(summary?.total_income, language)}</strong>
          </div>
          <div>
            <small>{tt("expenses", "Gastos confirmados")}</small>
            <strong className="money-expense">{formatMoney(summary?.total_expenses, language)}</strong>
          </div>
          <div>
            <small>{tt("realized", "Fechamento real")}</small>
            <strong>{formatMoney(summary?.transactions_projected_closing, language)}</strong>
          </div>
        </div>

        <div className="categories-detail-list">
          <BreakdownGroup
            color="var(--income)"
            icon={<HandCoins size={17} />}
            label={tt("receivables", "Recebíveis previstos")}
            hint={receivables.length ? countHint(receivables.length, "recebível", "recebíveis", "receivable", "receivables") : tt("emptyReceivables", "Nenhum recebível previsto neste fechamento.")}
            amount={receivableTotal}
            tone="income"
            open={openSection === "receivables"}
            onToggle={() => toggle("receivables")}
          >
            {receivables.length ? receivables.map((item) => (
              <article className="categories-detail-item" key={`${item.due_date}-${item.description}-${item.amount}`}>
                <i><HandCoins size={17} /></i>
                <span>
                  <strong>{item.origin || item.description}</strong>
                  <small>
                    <CalendarDays size={12} />
                    {formatDateShort(item.due_date, language)}
                    {item.origin ? <><em>·</em>{item.description}</> : null}
                  </small>
                </span>
                <strong className="income">{formatMoney(item.amount, language)}</strong>
              </article>
            )) : (
              <p className="day-wallet-empty">{tt("emptyReceivables", "Nenhum recebível previsto neste fechamento.")}</p>
            )}
          </BreakdownGroup>

          <BreakdownGroup
            color="var(--expense)"
            icon={<CreditCard size={17} />}
            label={tt("invoices", "Faturas abertas (previsto)")}
            hint={invoices.length ? countHint(invoices.length, "fatura", "faturas", "invoice", "invoices") : tt("emptyInvoices", "Nenhuma fatura aberta com valor previsto neste fechamento.")}
            amount={invoiceTotal}
            tone="money-expense"
            open={openSection === "invoices"}
            onToggle={() => toggle("invoices")}
          >
            {invoices.length ? invoices.map((item) => (
              <article className="categories-detail-item is-expense" key={`${item.card_name}-${item.payment_date}-${item.difference}`}>
                <i><CreditCard size={17} /></i>
                <span>
                  <strong>{item.card_name}</strong>
                  <small>
                    {tt("currentTotal", "Total atual")} {formatMoney(item.current_total, language)}
                    <em>·</em>
                    {tt("projectedTotal", "Previsto")} {formatMoney(item.projected_total, language)}
                    <em>·</em>
                    <CalendarDays size={12} />
                    {formatDateShort(item.payment_date, language)}
                  </small>
                </span>
                <strong className="money-expense">{formatMoney(item.difference, language)}</strong>
              </article>
            )) : (
              <p className="day-wallet-empty">{tt("emptyInvoices", "Nenhuma fatura aberta com valor previsto neste fechamento.")}</p>
            )}
          </BreakdownGroup>
        </div>

        <footer className="projection-breakdown-total">
          <span>{tt("total", "Fechamento previsto")}</span>
          <strong>{formatMoney(summary?.projected_closing, language)}</strong>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
