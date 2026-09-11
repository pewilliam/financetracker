import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarDays, CreditCard, Loader2, ReceiptText, Tags, X } from "lucide-react";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function CategoryExpenseDetailsModal({ group, categories, language, loading, error, income = false, onClose }) {
  const closeButtonRef = useRef(null);
  const details = group.details || [];
  const groupCategories = (group.category_ids || []).map((categoryId) => categories.find((category) => category.id === categoryId)).filter(Boolean);
  const average = details.length ? Number(group.amount || 0) / details.length : 0;
  const text = language === "en-US"
    ? income
      ? { eyebrow: "Income details", total: "Group total", entries: "entries", average: "Average income", empty: "No income details available.", loading: "Loading income…", error: "Could not load the income details.", standalone: "Standalone entry", invoice: "Invoice", installment: "Installment" }
      : { eyebrow: "Expense details", total: "Group total", entries: "entries", average: "Average expense", empty: "No expense details available.", loading: "Loading expenses…", error: "Could not load the expense details.", standalone: "Standalone entry", invoice: "Invoice", installment: "Installment" }
    : income
      ? { eyebrow: "Detalhes dos ganhos", total: "Total do grupo", entries: "lançamentos", average: "Ganho médio", empty: "Nenhum ganho disponível neste grupo.", loading: "Carregando ganhos…", error: "Não foi possível carregar os detalhes dos ganhos.", standalone: "Lançamento avulso", invoice: "Fatura", installment: "Parcela" }
      : { eyebrow: "Detalhes dos gastos", total: "Total do grupo", entries: "lançamentos", average: "Gasto médio", empty: "Nenhum detalhe disponível para este grupo.", loading: "Carregando lançamentos…", error: "Não foi possível carregar os detalhes dos gastos.", standalone: "Lançamento avulso", invoice: "Fatura", installment: "Parcela" };

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

  return createPortal(
    <div className="modal-layer categories-detail-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close details" : "Fechar detalhes"} />
      <section className="modal-card categories-detail-modal" role="dialog" aria-modal="true" aria-labelledby="category-expense-detail-title">
        <header className="categories-detail-header" style={{ "--category-color": group.color }}>
          <i><Tags size={20} /></i>
          <div><p className="eyebrow">{text.eyebrow}</p><h2 id="category-expense-detail-title">{group.name}</h2></div>
          <button ref={closeButtonRef} className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close" : "Fechar"}><X size={18} /></button>
        </header>

        {groupCategories.length > 0 && <div className="categories-detail-tags">{groupCategories.map((category) => <span key={category.id} style={{ "--category-color": category.color }}><i />{category.name}</span>)}</div>}

        <div className="categories-detail-summary">
          <div><small>{text.total}</small><strong>{formatMoney(group.amount, language)}</strong><span>{Number(group.percentage || 0).toFixed(1)}% {language === "en-US" ? "of the month" : "do mês"}</span></div>
          <div><small>{language === "en-US" ? "Composition" : "Composição"}</small><strong>{loading ? "—" : details.length}</strong><span>{text.entries}</span></div>
          <div><small>{text.average}</small><strong>{loading ? "—" : formatMoney(average, language)}</strong><span>{language === "en-US" ? "per entry" : "por lançamento"}</span></div>
        </div>

        <div className="categories-detail-list">
          {loading ? <div className="categories-detail-status"><Loader2 className="spin" size={22} /><span>{text.loading}</span></div> : error ? <div className="categories-detail-status error"><AlertTriangle size={22} /><span>{text.error}</span></div> : details.length ? details.map((detail) => {
            const installment = detail.source_type === "installment_item";
            const invoice = detail.source_type === "invoice_item";
            const SourceIcon = installment || invoice ? CreditCard : ReceiptText;
            const origin = installment
              ? `${detail.invoice_name ? `${text.invoice} ${detail.invoice_name} · ` : ""}${text.installment} ${detail.installment_number}/${detail.installment_count}`
              : invoice
                ? `${text.invoice} ${detail.invoice_name || ""}`.trim()
                : text.standalone;
            return (
              <article className="categories-detail-item" key={`${detail.source_type}-${detail.source_id}`}>
                <i><SourceIcon size={17} /></i>
                <span><strong>{detail.description}</strong><small><CalendarDays size={12} /> {formatDateShort(detail.date, language)}<em>·</em>{origin}</small></span>
                <strong className={income ? "income" : Number(detail.amount) < 0 ? "refund" : ""}>{formatMoney(detail.amount, language)}</strong>
              </article>
            );
          }) : <div className="categories-detail-empty"><ReceiptText size={22} /><span>{text.empty}</span></div>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
