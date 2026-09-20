import { Wallet, X } from "lucide-react";
import DateField from "../components/DateField.jsx";
import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function ReceivablePaymentModal({ data, setData, categories = [], onCreateCategory, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const updateData = (patch) => setData({ ...data, ...patch });
  const isFullPayment = data.mode === "paid";
  const remaining = Number(data.receivable.remaining_amount || 0);
  const paidAmount = parseTypedMoneyInput(data.amount, language);
  const normalizeAmount = () => {
    if (!data.amount) return;
    updateData({ amount: formatTypedMoneyAsCurrency(data.amount, language) });
  };
  const submit = (event) => {
    event.preventDefault();
    if ((!isFullPayment && (!paidAmount || paidAmount > remaining)) || !data.paid_at) return;
    onSubmit(data);
  };

  return (
    <div className="modal-layer receivable-action-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="modal-card invoice-modal receivable-payment-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="receivable-payment-title">
        <header className="transaction-entry-titlebar compact">
          <span className="transaction-entry-icon"><Wallet size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{data.receivable.person_name}</p>
            <h2 id="receivable-payment-title">{isFullPayment ? tt("receivables.markPaid", "Marcar como pago") : tt("receivables.partialPayment", "Pagamento parcial")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}>
            <X size={18} />
          </button>
        </header>
        <div className="invoice-modal-body">
          <div className="receivable-payment-context">
            <span>{tt("receivables.remaining", "Restante")}</span>
            <strong>{formatMoney(remaining, language)}</strong>
          </div>
          <div className="field-label"><span>{tt("receivables.amountPaid", "Valor pago")}</span><input inputMode="decimal" placeholder={formatMoney(0, language)} value={isFullPayment ? formatMoney(remaining, language) : data.amount} readOnly={isFullPayment} onChange={(event) => updateData({ amount: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={normalizeAmount} required /></div>
          <div className="field-label"><span>{tt("receivables.paidAt", "Data do pagamento")}</span><DateField value={data.paid_at} onChange={(value) => updateData({ paid_at: value })} /></div>
          <div className="invoice-field"><span>Categorias do recebimento</span><CategorySelect categories={categories} values={data.category_ids || []} onChange={(value) => updateData({ category_ids: value })} onCreate={onCreateCategory} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary" disabled={!isFullPayment && (!paidAmount || paidAmount > remaining)}>{isFullPayment ? tt("receivables.confirmPayment", "Confirmar pagamento") : tt("receivables.registerPayment", "Registrar pagamento")}</button>
        </div>
      </form>
    </div>
  );
}


