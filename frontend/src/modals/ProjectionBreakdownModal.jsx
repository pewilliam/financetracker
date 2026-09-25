import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

function StatementRow({ label, amount, tone, expandable, open, onToggle, children }) {
  const value = (
    <strong className={tone === "income" ? "income" : tone === "expense" ? "money-expense" : ""}>
      {formatMoney(amount)}
    </strong>
  );
  if (!expandable) {
    return (
      <div className={`projection-breakdown-row is-${tone}`}>
        <span>{label}</span>
        {value}
      </div>
    );
  }
  return (
    <div className={`projection-breakdown-group ${open ? "open" : ""}`}>
      <button className={`projection-breakdown-row is-${tone}`} type="button" aria-expanded={open} onClick={onToggle}>
        <span>{label}</span>
        {value}
        <ChevronDown size={16} />
      </button>
      {open && <div className="projection-breakdown-details">{children}</div>}
    </div>
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
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (section) => setOpenSection((current) => current === section ? null : section);

  return createPortal(
    <div className="modal-layer projection-breakdown-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={tt("close", "Fechar detalhamento")} />
      <section className="modal-card projection-breakdown-modal" role="dialog" aria-modal="true" aria-labelledby="projection-breakdown-title">
        <header className="projection-breakdown-header">
          <div>
            <p className="eyebrow">{tt("eyebrow", "Projeção")}</p>
            <h2 id="projection-breakdown-title">{tt("title", "Fechamento previsto")}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} aria-label={tt("close", "Fechar")}><X size={18} /></button>
        </header>
        <div className="projection-breakdown-list">
          <StatementRow label={tt("income", "Ganhos confirmados")} amount={summary?.total_income} tone="income" />
          <StatementRow label={tt("expenses", "Gastos confirmados")} amount={summary?.total_expenses} tone="expense" />
          <StatementRow label={tt("realized", "Fechamento real")} amount={summary?.transactions_projected_closing} tone="balance" />
          <StatementRow
            label={tt("receivables", "Recebíveis previstos")}
            amount={receivableTotal}
            tone="income"
            expandable
            open={openSection === "receivables"}
            onToggle={() => toggle("receivables")}
          >
            {receivables.length ? receivables.map((item) => (
              <div className="projection-breakdown-detail" key={`${item.due_date}-${item.description}-${item.amount}`}>
                <span>
                  <strong>{item.origin || item.description}</strong>
                  <small>{item.origin ? item.description : tt("receivable", "Recebível")} · {formatDateShort(item.due_date, language)}</small>
                </span>
                <strong className="income">{formatMoney(item.amount)}</strong>
              </div>
            )) : <p>{tt("emptyReceivables", "Nenhum recebível previsto neste fechamento.")}</p>}
          </StatementRow>
          <StatementRow
            label={tt("invoices", "Faturas abertas (previsto)")}
            amount={invoiceTotal}
            tone="expense"
            expandable
            open={openSection === "invoices"}
            onToggle={() => toggle("invoices")}
          >
            {invoices.length ? invoices.map((item) => (
              <div className="projection-breakdown-detail" key={`${item.card_name}-${item.payment_date}-${item.difference}`}>
                <span>
                  <strong>{item.card_name}</strong>
                  <small>
                    {tt("currentTotal", "Total atual")} {formatMoney(item.current_total)}
                    {" · "}
                    {tt("projectedTotal", "Previsto")} {formatMoney(item.projected_total)}
                    {" · "}
                    {formatDateShort(item.payment_date, language)}
                  </small>
                </span>
                <strong className="money-expense">{formatMoney(item.difference)}</strong>
              </div>
            )) : <p>{tt("emptyInvoices", "Nenhuma fatura aberta com valor previsto neste fechamento.")}</p>}
          </StatementRow>
        </div>
        <footer className="projection-breakdown-total">
          <span>{tt("total", "Fechamento previsto")}</span>
          <strong>{formatMoney(summary?.projected_closing)}</strong>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
