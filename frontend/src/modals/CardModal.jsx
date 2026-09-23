import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CreditCard, Loader2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { defaultCardForm, isMobileViewport, normalizeInvoiceColor } from "../app/helpers.js";
import ColorPickerField from "../components/ColorPickerField.jsx";
import FilterSelect from "../components/common/FilterSelect.jsx";
import WalletSelect from "../components/WalletSelect.jsx";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

function forecastKindFromCard(card) {
  if (card?.payment_forecast_kind === "first" || card?.payment_forecast_kind === "last" || card?.payment_forecast_kind === "day") {
    return card.payment_forecast_kind;
  }
  return card?.payment_forecast_day ? "day" : "due";
}

export default function CardModal({ initial, wallets = [], onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [form, setForm] = useState(initial ? {
    name: initial.name,
    institution: initial.institution || "",
    color: normalizeInvoiceColor(initial.color),
    credit_limit: initial.credit_limit === null || initial.credit_limit === undefined || initial.credit_limit === "" ? "" : formatMoney(initial.credit_limit, language),
    closing_day: initial.closing_day,
    due_day: initial.due_day,
    payment_forecast_kind: forecastKindFromCard(initial),
    payment_forecast_day: initial.payment_forecast_day ?? "",
    default_wallet_id: initial.default_wallet_id ? String(initial.default_wallet_id) : ""
  } : defaultCardForm());
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef(null);
  const closingDay = Math.min(31, Math.max(1, Number(form.closing_day) || 1));
  const dueDay = Math.min(31, Math.max(1, Number(form.due_day) || 1));
  const forecastValue = String(form.payment_forecast_day ?? "").trim();
  const paymentForecastDay = forecastValue ? Math.min(31, Math.max(1, Number(forecastValue) || 1)) : null;
  useModalLifecycle({ onClose, busy: submitting, initialFocusRef: nameInputRef, autoFocus: !isMobileViewport() });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        color: normalizeInvoiceColor(form.color),
        closing_day: closingDay,
        due_day: dueDay,
        payment_forecast_kind: form.payment_forecast_kind === "due" ? null : form.payment_forecast_kind,
        payment_forecast_day: form.payment_forecast_kind === "day" ? paymentForecastDay : null,
        credit_limit: String(form.credit_limit || "").trim() ? parseTypedMoneyInput(form.credit_limit, language) : null,
        default_wallet_id: form.default_wallet_id ? Number(form.default_wallet_id) : null
      });
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-layer invoice-template-modal-layer">
      <button className="modal-backdrop" type="button" onClick={submitting ? undefined : onClose} aria-label={tt("actions.cancel", "Cancelar")} />
      <form className="modal-card wallet-modal wallet-editor-modal invoice-template-editor-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="card-modal-title">
        <div className="wallet-transfer-header">
          <i><CreditCard size={20} /></i>
          <div>
            <small>{tt("cards.editorEyebrow", "CARTÃO DE CRÉDITO")}</small>
            <h2 id="card-modal-title">{initial ? tt("cards.edit", "Editar cartão") : tt("cards.new", "Novo cartão")}</h2>
            <p>{tt("cards.editorHint", "O dia de fechamento inicia um novo ciclo: uma compra nessa data entra na fatura seguinte. Faturas em aberto passam a usar o vencimento e a previsão deste cartão. Faturas pagas permanecem como foram.")}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={submitting} aria-label={tt("actions.close", "Fechar modal")}><X size={18} /></button>
        </div>
        <div className="wallet-modal-body form-stack invoice-template-editor-body">
          <div className="field-label"><span>{tt("cards.name", "Nome")}</span><input ref={nameInputRef} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={tt("cards.namePlaceholder", "Ex: Nubank, Inter...")} disabled={submitting} required /></div>
          <div className="field-label"><span>{tt("cards.institution", "Instituição")}</span><input maxLength={255} value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} placeholder={tt("cards.institutionPlaceholder", "Opcional")} disabled={submitting} /></div>
          <div className="shared-color-field">
            <span>{tt("cards.color", "Cor")}</span>
            <ColorPickerField value={form.color} onChange={(color) => setForm({ ...form, color })} label={tt("cards.customColor", "Cor personalizada")} ariaLabel={tt("cards.chooseColor", "Escolher a cor do cartão")} disabled={submitting} />
          </div>
          <div className="field-label"><span>{tt("cards.limit", "Limite")}</span><input inputMode="decimal" value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={() => setForm({ ...form, credit_limit: form.credit_limit ? formatTypedMoneyAsCurrency(form.credit_limit, language) : "" })} placeholder={tt("cards.limitPlaceholder", "Opcional")} disabled={submitting} /></div>
          <div className="installment-form-row">
            <div className="field-label"><span>{tt("cards.closingDay", "Dia de fechamento")}</span><input type="number" min="1" max="31" value={form.closing_day ?? ""} onChange={(event) => setForm({ ...form, closing_day: event.target.value })} onBlur={() => setForm({ ...form, closing_day: closingDay })} disabled={submitting} required /></div>
            <div className="field-label"><span>{tt("cards.dueDay", "Dia de vencimento")}</span><input type="number" min="1" max="31" value={form.due_day ?? ""} onChange={(event) => setForm({ ...form, due_day: event.target.value })} onBlur={() => setForm({ ...form, due_day: dueDay })} disabled={submitting} required /></div>
          </div>
          <div className="field-label">
            <span>{tt("cards.paymentForecast", "Previsão de pagamento")}</span>
            <FilterSelect
              value={form.payment_forecast_kind || "due"}
              ariaLabel={tt("cards.paymentForecast", "Previsão de pagamento")}
              disabled={submitting}
              onChange={(value) => setForm({ ...form, payment_forecast_kind: value, payment_forecast_day: value === "day" ? (form.payment_forecast_day || 1) : form.payment_forecast_day })}
              options={[
                { value: "due", label: tt("cards.forecastOnDue", "No vencimento") },
                { value: "first", label: tt("cards.forecastFirst", "Primeiro dia do mês") },
                { value: "last", label: tt("cards.forecastLast", "Último dia do mês") },
                { value: "day", label: tt("cards.forecastChooseDay", "Escolher o dia") },
              ]}
            />
            {form.payment_forecast_kind === "day" && (
              <input type="number" min="1" max="31" value={form.payment_forecast_day ?? ""} onChange={(event) => setForm({ ...form, payment_forecast_day: event.target.value })} onBlur={() => setForm({ ...form, payment_forecast_day: paymentForecastDay ?? "" })} placeholder={tt("cards.forecastDay", "Dia")} disabled={submitting} aria-label={tt("cards.forecastDay", "Dia")} />
            )}
            <small id="card-payment-forecast-hint">{tt("cards.paymentForecastHint", "É o dia em que o pagamento entra no controle mensal, no mês do vencimento. No vencimento usa o dia do cartão. Primeiro e último dia acompanham o mês, inclusive fevereiro. Um dia fixo que não existe, como 31, cai no último dia daquele mês.")}</small>
          </div>
          <div className="invoice-field">
            <span>{tt("cards.wallet", "Carteira padrão")}</span>
            <WalletSelect wallets={wallets.filter((wallet) => wallet.active)} value={form.default_wallet_id} onChange={(value) => setForm({ ...form, default_wallet_id: value || "" })} clearable placeholder={tt("cards.walletPlaceholder", "Usar a carteira principal")} ariaLabel={tt("cards.wallet", "Carteira padrão")} />
          </div>
        </div>
        <footer className="wallet-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary" type="submit" disabled={submitting || !form.name.trim()}>{submitting ? <><Loader2 className="spin" size={16} /> {tt("actions.saving", "Salvando...")}</> : tt("actions.save", "Salvar")}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
