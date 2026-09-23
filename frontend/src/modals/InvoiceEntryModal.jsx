import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMinus, Layers3, Loader2, ReceiptText, Repeat2, ShoppingBag, X } from "lucide-react";

import { isMobileViewport } from "../app/helpers.js";
import CategorySelect from "../components/CategorySelect.jsx";
import FilterSelect from "../components/common/FilterSelect.jsx";
import DateField from "../components/DateField.jsx";
import { previewCardSubscription } from "../api/api.js";
import { useI18n } from "../i18n/index.ts";
import { todayIsoDate } from "../app/helpers.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

const PERIOD_ADJECTIVE = {
  monthly: ["mensal", "monthly"],
  bimonthly: ["bimestral", "bimonthly"],
  quarterly: ["trimestral", "quarterly"],
  semiannual: ["semestral", "semiannual"],
  annual: ["anual", "annual"],
};

function planHint({ preview, period, termKind, termMonths, termEndDate, amount, language, copy }) {
  if (!preview?.valid) {
    if (preview?.reason === "end_before_start") {
      return copy("A data de término é anterior à primeira cobrança.", "The end date is before the first charge.");
    }
    if (preview?.reason === "invalid_months") {
      return copy("Informe de 1 a 120 meses.", "Enter 1 to 120 months.");
    }
    return "";
  }
  const names = PERIOD_ADJECTIVE[period] || PERIOD_ADJECTIVE.monthly;
  const adjective = language === "en-US" ? names[1] : names[0];
  const titled = `${adjective.charAt(0).toUpperCase()}${adjective.slice(1)}`;
  const money = amount > 0 ? formatMoney(amount, language) : "";
  if (termKind === "indefinite") {
    return copy(
      `Cobrança ${adjective} por prazo indeterminado. A assinatura será projetada somente nas próximas faturas conforme a regra atual.`,
      `${titled} billing with an open-ended term. The subscription is forecast only on the upcoming invoices, following the current rule.`,
    );
  }
  const count = preview.charge_count;
  if (count == null) return "";
  const charges = language === "en-US"
    ? `${count} ${count === 1 ? "charge" : "charges"}`
    : `${count} ${count === 1 ? "cobrança" : "cobranças"}`;
  const priced = money ? copy(`${charges} de ${money}`, `${charges} of ${money}`) : charges;
  if (termKind === "end_date" && termEndDate) {
    const end = formatDateShort(termEndDate, language);
    return copy(
      `Cobrança ${adjective} até ${end}. Serão ${priced} até essa data.`,
      `${titled} billing until ${end}. There will be ${priced} through that date.`,
    );
  }
  const months = Number(termMonths);
  const monthLabel = language === "en-US"
    ? `${months} ${months === 1 ? "month" : "months"}`
    : `${months} ${months === 1 ? "mês" : "meses"}`;
  const interval = Number(preview.billing_interval_months || 1);
  const exact = months > 0 && months % interval === 0;
  if (exact) {
    const verb = count === 1 ? "será" : "serão";
    return copy(
      `${monthLabel} com cobrança ${adjective} ${verb} ${priced}.`,
      `${monthLabel} with ${adjective} billing will be ${priced}.`,
    );
  }
  const forecast = language === "en-US" ? "" : (count === 1 ? "prevista" : "previstas");
  return copy(
    `Compromisso de ${monthLabel} com cobrança ${adjective}. Serão ${priced} ${forecast} até o término.`.replace(/\s+/g, " "),
    `A ${months}-month commitment with ${adjective} billing. ${priced} ${count === 1 ? "is" : "are"} forecast through the end.`,
  );
}

const BILLING_PERIODS = ["monthly", "bimonthly", "quarterly", "semiannual", "annual"];

export default function InvoiceEntryModal({ invoice, cards = [], cardId = "", kind = "expense", mode = "single", subscription = null, categories = [], onCreateCategory, onOpenSingle, onOpenSubscription, onOpenInstallment, onSave, onClose }) {
  const { language } = useI18n();
  const copy = (pt, en) => language === "en-US" ? en : pt;
  const isRefund = kind === "refund";
  const editingSubscription = subscription || null;
  const isSubscription = !isRefund && (mode === "subscription" || Boolean(editingSubscription));
  const lockedCardId = editingSubscription ? "" : String(invoice?.credit_card_id || cardId || "");
  const [form, setForm] = useState(() => {
    if (!editingSubscription) {
      return {
        description: "",
        amount: "",
        category_ids: [],
        credit_card_id: lockedCardId,
        purchase_date: todayIsoDate(),
        charge_day: Number(todayIsoDate().slice(8, 10)),
        chargeDayTouched: false,
        billing_period: "monthly",
        term_kind: "indefinite",
        term_months: "12",
        term_end_date: "",
      };
    }
    const period = BILLING_PERIODS.includes(editingSubscription.billing_period) ? editingSubscription.billing_period : "monthly";
    const categoryIds = editingSubscription.category_ids?.length
      ? editingSubscription.category_ids
      : (editingSubscription.categories || []).map((category) => category.id);
    return {
      description: editingSubscription.description || "",
      amount: formatMoney(editingSubscription.amount, language),
      category_ids: categoryIds.map(String),
      credit_card_id: String(editingSubscription.credit_card_id || ""),
      purchase_date: editingSubscription.start_date || todayIsoDate(),
      charge_day: editingSubscription.charge_day || 1,
      chargeDayTouched: true,
      billing_period: period,
      term_kind: editingSubscription.term_kind || "indefinite",
      term_months: String(editingSubscription.term_months || 12),
      term_end_date: editingSubscription.term_end_date || "",
    };
  });
  const [saving, setSaving] = useState(false);
  const amountInputRef = useRef(null);
  const amount = parseTypedMoneyInput(form.amount, language);
  const selectedCard = cards.find((card) => String(card.id) === String(form.credit_card_id));
  const chargeDay = Number(form.charge_day);
  const termMonths = Number(form.term_months);
  const termReady = !isSubscription || (
    form.term_kind === "indefinite"
    || (form.term_kind === "months" && termMonths >= 1 && termMonths <= 120)
    || (form.term_kind === "end_date" && Boolean(form.term_end_date))
  );
  const recurringReady = !isSubscription || (chargeDay >= 1 && chargeDay <= 31 && termReady);
  const canSave = Boolean((form.description.trim() || isRefund) && amount > 0 && !saving && recurringReady && (isRefund || form.credit_card_id) && (isRefund || editingSubscription || form.purchase_date));
  const hasModeSwitch = !isRefund && !editingSubscription && Boolean(onOpenInstallment);
  const [planPreview, setPlanPreview] = useState(null);

  useEffect(() => {
    if (!isSubscription) return undefined;
    if (!(chargeDay >= 1 && chargeDay <= 31)) {
      setPlanPreview(null);
      return undefined;
    }
    if (form.term_kind === "end_date" && !form.term_end_date) {
      setPlanPreview(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const payload = editingSubscription ? {
        start_date: editingSubscription.start_date,
        current_charge_day: editingSubscription.charge_day,
        posted: Boolean(editingSubscription.has_posted_charge),
        charge_day: chargeDay,
        billing_period: form.billing_period,
        term_kind: form.term_kind,
        term_months: form.term_kind === "months" ? termMonths : null,
        term_end_date: form.term_kind === "end_date" ? form.term_end_date : null,
      } : {
        purchase_date: form.purchase_date,
        charge_day: chargeDay,
        billing_period: form.billing_period,
        term_kind: form.term_kind,
        term_months: form.term_kind === "months" ? termMonths : null,
        term_end_date: form.term_kind === "end_date" ? form.term_end_date : null,
      };
      previewCardSubscription(payload)
        .then((preview) => { if (!cancelled) setPlanPreview(preview); })
        .catch(() => { if (!cancelled) setPlanPreview(null); });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isSubscription,
    editingSubscription,
    form.purchase_date,
    form.billing_period,
    form.term_kind,
    form.term_months,
    form.term_end_date,
    chargeDay,
    termMonths,
  ]);

  useEffect(() => {
    if (isMobileViewport()) return undefined;
    const focusFrame = requestAnimationFrame(() => amountInputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(focusFrame);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (document.querySelector(".category-modal-layer, .filter-select-menu")) return;
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const subscriptionFields = {
        description: form.description.trim(),
        amount: Math.abs(amount),
        category_ids: form.category_ids.map(Number),
        credit_card_id: Number(form.credit_card_id),
        charge_day: chargeDay,
        billing_period: form.billing_period,
        term_kind: form.term_kind,
        term_months: form.term_kind === "months" ? termMonths : null,
        term_end_date: form.term_kind === "end_date" ? form.term_end_date : null,
      };
      await onSave(isRefund ? {
        description: form.description.trim() || copy("Reembolso", "Refund"),
        amount: -Math.abs(amount),
        category_ids: form.category_ids.map(Number),
      } : editingSubscription ? subscriptionFields : {
        ...subscriptionFields,
        purchase_date: form.purchase_date,
        recurring: isSubscription,
        charge_day: isSubscription ? chargeDay : undefined,
        billing_period: isSubscription ? form.billing_period : undefined,
        term_kind: isSubscription ? form.term_kind : undefined,
        term_months: isSubscription && form.term_kind === "months" ? termMonths : undefined,
        term_end_date: isSubscription && form.term_kind === "end_date" ? form.term_end_date : undefined,
      });
    } catch {
      // A página exibe o erro e mantém os dados para uma nova tentativa.
    } finally {
      setSaving(false);
    }
  };

  const title = isRefund
    ? copy("Adicionar reembolso", "Add refund")
    : editingSubscription
      ? copy("Editar assinatura", "Edit subscription")
      : isSubscription
        ? copy("Adicionar assinatura", "Add subscription")
        : copy("Adicionar compra", "Add purchase");
  const heading = isRefund
    ? copy(`FATURA · ${invoice?.name || ""}`, `INVOICE · ${invoice?.name || ""}`)
    : copy(`CARTÃO · ${selectedCard?.name || invoice?.name || "COMPRA"}`, `CARD · ${selectedCard?.name || invoice?.name || "PURCHASE"}`);

  return createPortal(
    <div className="modal-layer transaction-modal-layer invoice-entry-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form className={`modal-card transaction-modal invoice-entry-modal ${isRefund ? "refund" : "expense"}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="invoice-entry-modal-title">
        <header className={`transaction-entry-titlebar invoice-entry-titlebar ${hasModeSwitch ? "" : "compact"}`}>
          <span className="transaction-entry-icon">{isRefund ? <CircleMinus size={21} /> : isSubscription ? <Repeat2 size={21} /> : <ShoppingBag size={21} />}</span>
          <div className="transaction-entry-heading">
            <p>{heading}</p>
            <h2 id="invoice-entry-modal-title">{title}</h2>
          </div>
          {hasModeSwitch && (
            <div className="transaction-mode-switch columns-3" aria-label={copy("Tipo de compra", "Purchase type")}>
              <button className={isSubscription ? "" : "active"} type="button" aria-pressed={!isSubscription} onClick={() => onOpenSingle?.()}><ReceiptText size={15} /> {copy("Compra única", "One-time purchase")}</button>
              <button className={isSubscription ? "active" : ""} type="button" aria-pressed={isSubscription} onClick={() => onOpenSubscription?.()}><Repeat2 size={15} /> {copy("Assinatura", "Subscription")}</button>
              <button type="button" aria-pressed="false" onClick={onOpenInstallment}><Layers3 size={15} /> {copy("Compra parcelada", "Installment purchase")}</button>
            </div>
          )}
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={copy("Fechar", "Close")}>
            <X size={18} />
          </button>
        </header>

        <div className="transaction-modal-body invoice-entry-modal-body">
          <div className="amount-field">
            <span>{copy("Valor", "Amount")}</span>
            <div className={`money-input ${isRefund ? "success" : "danger"}`}>
              <span>R$</span>
              <input
                ref={amountInputRef}
                inputMode="decimal"
                value={form.amount.replace(/^R\$\s?/, "")}
                onChange={(event) => setForm((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))}
                onBlur={() => setForm((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))}
                onFocus={(event) => event.target.select()}
                aria-label={copy("Valor", "Amount")}
              />
            </div>
          </div>

          <div className="invoice-entry-description">
            <span>{copy("Descrição", "Description")}</span>
            <input
              maxLength={255}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder={isRefund ? copy("Opcional. Ex: estorno ou devolução", "Optional. Ex: reversal or return") : isSubscription ? copy("Ex: Netflix, academia, streaming...", "Ex: Netflix, gym, streaming...") : copy("Ex: supermercado, restaurante...", "Ex: groceries, restaurant...")}
            />
          </div>

          <div className="invoice-entry-category">
            <span>{copy("Categoria", "Category")}</span>
            <CategorySelect
              categories={categories}
              values={form.category_ids}
              onChange={(category_ids) => setForm((current) => ({ ...current, category_ids }))}
              onCreate={onCreateCategory}
            />
          </div>
          {!isRefund && (
            <>
              {!lockedCardId && (
                <div className="invoice-entry-category">
                  <span>{copy("Cartão", "Card")}</span>
                  <CategorySelect
                    categories={cards.filter((card) => card.active || String(card.id) === String(form.credit_card_id)).map((card) => ({ id: card.id, name: card.name, color: card.color }))}
                    value={form.credit_card_id}
                    onChange={(credit_card_id) => setForm((current) => ({ ...current, credit_card_id }))}
                    multiple={false}
                    clearable={false}
                    placeholder={copy("Selecione o cartão", "Select the card")}
                    searchPlaceholder={copy("Buscar cartão...", "Search card...")}
                    ariaLabel={copy("Cartão", "Card")}
                  />
                </div>
              )}
              {editingSubscription ? (
                <div className="invoice-entry-description">
                  <span>{copy("Início", "Start")}</span>
                  <input value={formatDateShort(editingSubscription.start_date, language)} readOnly aria-label={copy("Data de início", "Start date")} />
                </div>
              ) : (
                <div className="invoice-entry-description">
                  <span>{copy("Data da compra", "Purchase date")}</span>
                  <DateField value={form.purchase_date} onChange={(purchase_date) => setForm((current) => ({
                    ...current,
                    purchase_date,
                    charge_day: current.chargeDayTouched ? current.charge_day : Number(String(purchase_date).slice(8, 10)) || current.charge_day,
                  }))} />
                </div>
              )}
              {isSubscription && (
                <>
                  {editingSubscription && (
                    <div className="invoice-entry-span">
                      <small>{copy(
                        "Cobranças já lançadas permanecem na fatura. A alteração vale para as próximas previsões.",
                        "Charges already posted stay on the invoice. Changes apply to upcoming forecasts.",
                      )}</small>
                    </div>
                  )}
                  <div className="invoice-entry-description">
                    <span>{copy("Periodicidade", "Billing period")}</span>
                    <FilterSelect
                      value={form.billing_period}
                      onChange={(billing_period) => setForm((current) => ({ ...current, billing_period }))}
                      ariaLabel={copy("Periodicidade da cobrança", "Billing period")}
                      options={[
                        { value: "monthly", label: copy("Mensal", "Monthly") },
                        { value: "bimonthly", label: copy("Bimestral", "Every 2 months") },
                        { value: "quarterly", label: copy("Trimestral", "Quarterly") },
                        { value: "semiannual", label: copy("Semestral", "Semiannual") },
                        { value: "annual", label: copy("Anual", "Annual") },
                      ]}
                    />
                  </div>
                  <div className="invoice-entry-description">
                    <span>{copy("Duração", "Commitment")}</span>
                    <FilterSelect
                      value={form.term_kind}
                      onChange={(term_kind) => setForm((current) => ({ ...current, term_kind }))}
                      ariaLabel={copy("Duração do compromisso", "Commitment length")}
                      options={[
                        { value: "indefinite", label: copy("Prazo indeterminado", "Open-ended") },
                        { value: "months", label: copy("Quantidade de meses", "Number of months") },
                        { value: "end_date", label: copy("Data de término", "End date") },
                      ]}
                    />
                  </div>
                  <div className="invoice-entry-plan-row">
                    {form.term_kind === "months" && (
                      <div className="invoice-entry-charge-day">
                        <span>{copy("Quantidade de meses", "Number of months")}</span>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          inputMode="numeric"
                          value={form.term_months}
                          onChange={(event) => setForm((current) => ({ ...current, term_months: event.target.value }))}
                          aria-label={copy("Quantidade de meses", "Number of months")}
                        />
                      </div>
                    )}
                    {form.term_kind === "end_date" && (
                      <div className="invoice-entry-span">
                        <span>{copy("Data de término", "End date")}</span>
                        <DateField value={form.term_end_date} onChange={(term_end_date) => setForm((current) => ({ ...current, term_end_date }))} />
                      </div>
                    )}
                    <div className="invoice-entry-charge-day">
                      <span>{copy("Dia da cobrança", "Charge day")}</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        inputMode="numeric"
                        value={form.charge_day}
                        onChange={(event) => setForm((current) => ({ ...current, charge_day: event.target.value, chargeDayTouched: true }))}
                        aria-label={copy("Dia da cobrança", "Charge day")}
                      />
                    </div>
                  </div>
                  <div className="invoice-entry-span invoice-entry-plan-hint">
                    <small>{planHint({
                      preview: planPreview,
                      period: form.billing_period,
                      termKind: form.term_kind,
                      termMonths: form.term_months,
                      termEndDate: form.term_end_date,
                      amount,
                      language,
                      copy,
                    })}</small>
                  </div>
                </>
              )}
            </>
          )}

        </div>
        <footer className="transaction-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{copy("Cancelar", "Cancel")}</button>
          <button className={`btn transaction-save ${isRefund ? "success" : "danger"}`} type="submit" disabled={!canSave}>
            {saving ? <><Loader2 className="spin" size={16} /> {editingSubscription ? copy("Salvando...", "Saving...") : copy("Adicionando...", "Adding...")}</> : title}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
