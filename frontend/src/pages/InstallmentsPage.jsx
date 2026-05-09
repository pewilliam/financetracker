import { CreditCard, Eye, Plus } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function InstallmentsPage({ installments, onNew, onDetails }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("installments.title", "Compras parceladas")}</p><h2>{tt("installments.installments", "Parcelamentos")}</h2></div>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> {tt("installments.installmentPurchase", "Compra parcelada")}</button>
      </div>
      {installments.length ? (
        <div className="installment-grid">
          {installments.map((purchase) => {
            const pct = purchase.installment_count ? (purchase.paid_installments / purchase.installment_count) * 100 : 0;
            const next = purchase.next_installment?.invoice;
            return (
              <article className="installment-card" key={purchase.id}>
                <header>
                  <h3><CreditCard size={18} /> {purchase.description}</h3>
                  {purchase.paid_installments === purchase.installment_count && <span className="paid-pill">QUITADA</span>}
                </header>
                <p>{formatMoney(purchase.total_amount)} • {purchase.installment_count}x {formatMoney(purchase.installment_value)}</p>
                <div className="installment-progress"><span style={{ width: `${pct}%` }} /></div>
                <strong>{tt("installments.progress", "Progresso:")} {purchase.paid_installments} / {purchase.installment_count}</strong>
                <p>{tt("installments.paid", "Pago:")} {formatMoney(purchase.paid_amount)} • {tt("installments.remaining", "Restante:")} {formatMoney(purchase.remaining_amount)}</p>
                <p>{tt("installments.nextInstallment", "Próxima parcela:")} {next ? `${next.name} — ${tt("installments.due", "vence")} ${formatDateShort(next.due_date)}` : "Fatura removida — realocar"}</p>
                <button className="btn btn-ghost" onClick={() => onDetails(purchase.id)}><Eye size={16} /> {tt("installments.details", "Detalhes")}</button>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma compra parcelada.</h3><p>Use Compra parcelada para distribuir valores nas faturas.</p></div>}
    </section>
  );
}


