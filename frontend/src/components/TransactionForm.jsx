import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Loader2, ReceiptText, Repeat2, X } from "lucide-react";
import DateField from "./DateField.jsx";
import InvoiceSelector from "./InvoiceSelector.jsx";
import { formatMoney, getFormatLocale, parseMoneyInput } from "../utils/format.js";

function getDayFromDate(dateString) {
  const day = Number(dateString?.split("-")?.[2]);
  return day ? String(day) : "";
}

function addMonths(dateString, months) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1 + months, day || 1);
  return date;
}

function formatMonthShort(date) {
  const label = date.toLocaleDateString(getFormatLocale(), { month: "short", year: "numeric" });
  return label.replace(".", "").replace(/^\w/, (letter) => letter.toUpperCase());
}

function parseTypedAmount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const decimalSeparator = getFormatLocale() === "en-US" ? "." : ",";
  if (text.includes(decimalSeparator)) {
    const [integerPart, decimalPart = ""] = text.split(decimalSeparator);
    const integer = integerPart.replace(/\D/g, "") || "0";
    const decimal = decimalPart.replace(/\D/g, "").slice(0, 2).padEnd(2, "0");
    return Number(`${integer}.${decimal}`);
  }
  if (text.includes(",")) return parseMoneyInput(text);
  return Number(text.replace(/\D/g, "") || 0);
}

function formatAmountForEditing(value) {
  const locale = getFormatLocale();
  const decimalSeparator = locale === "en-US" ? "." : ",";
  const text = String(value || "").replace(decimalSeparator === "." ? /[^\d.]/g : /[^\d,]/g, "");
  const [integerPart, decimalPart] = text.split(decimalSeparator);
  const digits = integerPart.replace(/\D/g, "");
  const number = Number(digits || 0);
  const integer = number ? number.toLocaleString(locale) : "";
  if (decimalPart === undefined) return integer;
  return `${integer}${decimalSeparator}${decimalPart.replace(/\D/g, "").slice(0, 2)}`;
}

function formatAmountAsCurrency(value) {
  const amount = parseTypedAmount(value);
  return amount ? formatMoney(amount) : "";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function todayIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export default function TransactionForm({
  open,
  initial,
  date,
  invoices = [],
  onClose,
  onSave,
  onCreateInvoice
}) {
  const [form, setForm] = useState({
    date: date || todayIsoDate(),
    type: "expense",
    amount: "",
    description: "",
    is_future: false,
    invoice_id: "",
    recurrence: false,
    day_of_month: "",
    recurrence_months: "12"
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [exclusiveHint, setExclusiveHint] = useState("");

  useEffect(() => {
    if (initial) {
      setForm({
        date: initial.date,
        type: initial.type,
        amount: formatMoney(initial.amount),
        description: initial.description || "",
        is_future: initial.is_future,
        invoice_id: initial.invoice_id || "",
        recurrence: false,
        day_of_month: "",
        recurrence_months: "12"
      });
    } else {
      setForm({
        date: date || todayIsoDate(),
        type: "expense",
        amount: "",
        description: "",
        is_future: false,
        invoice_id: "",
        recurrence: false,
        day_of_month: "",
        recurrence_months: "12"
      });
    }
    setErrors({});
    setTouched({});
    setSaving(false);
    setExclusiveHint("");
  }, [initial, date, open]);

  const handleAmount = (value) => {
    const formatted = formatAmountForEditing(value);
    setForm({ ...form, amount: formatted });
    if (touched.amount) validateField("amount", formatted);
  };

  const setField = (field, value) => {
    const nextForm = { ...form, [field]: value };
    if (field === "date" && form.recurrence && !touched.day_of_month) {
      nextForm.day_of_month = getDayFromDate(value);
    }
    setForm(nextForm);
    if (touched[field]) validateField(field, value, nextForm);
  };

  const validateField = (field, value = form[field], source = form) => {
    const nextErrors = { ...errors };
    const data = { ...source, [field]: value };
    if (field === "amount") {
      const amount = parseTypedAmount(value);
      if (!amount || amount <= 0) nextErrors.amount = "Informe um valor maior que zero";
      else delete nextErrors.amount;
    }
    if (field === "date") {
      if (!value || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) nextErrors.date = "Selecione uma data válida";
      else delete nextErrors.date;
    }
    if (field === "day_of_month" || field === "recurrence") {
      const day = Number(data.day_of_month);
      if (data.recurrence && (!data.day_of_month || day < 1 || day > 31)) nextErrors.day_of_month = "Informe o dia do mês";
      else delete nextErrors.day_of_month;
    }
    if (field === "invoice_id" || field === "is_future") {
      if (data.is_future && !data.invoice_id) nextErrors.invoice_id = "Selecione uma fatura";
      else delete nextErrors.invoice_id;
    }
    setErrors(nextErrors);
    return nextErrors;
  };

  const validateForm = () => {
    const nextErrors = {};
    const amount = parseTypedAmount(form.amount);
    if (!amount || amount <= 0) nextErrors.amount = "Informe um valor maior que zero";
    if (!form.date || Number.isNaN(new Date(`${form.date}T00:00:00`).getTime())) nextErrors.date = "Selecione uma data válida";
    if (form.recurrence) {
      const day = Number(form.day_of_month);
      if (!form.day_of_month || day < 1 || day > 31) nextErrors.day_of_month = "Informe o dia do mês";
    }
    if (form.is_future && !form.invoice_id) nextErrors.invoice_id = "Selecione uma fatura";
    setTouched({ amount: true, date: true, day_of_month: true, invoice_id: true });
    setErrors(nextErrors);
    return nextErrors;
  };

  const handleBlur = (field) => {
    setTouched({ ...touched, [field]: true });
    if (field === "amount") {
      const formatted = formatAmountAsCurrency(form.amount);
      setForm({ ...form, amount: formatted });
      validateField(field, formatted);
      return;
    }
    validateField(field);
  };

  const toggleFuture = () => {
    const enabled = !form.is_future;
    if (enabled && form.recurrence) setExclusiveHint("Fatura futura e recorrência são alternativas. Ativei fatura futura e desliguei recorrência.");
    else setExclusiveHint("");
    const nextForm = {
      ...form,
      is_future: enabled,
      recurrence: enabled ? false : form.recurrence,
      invoice_id: enabled ? form.invoice_id : ""
    };
    setForm(nextForm);
    if (!enabled) {
      const { invoice_id, ...nextErrors } = errors;
      setErrors(nextErrors);
      setTouched({ ...touched, invoice_id: false });
    }
  };

  const toggleRecurrence = () => {
    const enabled = !form.recurrence;
    if (enabled && form.is_future) setExclusiveHint("Fatura futura e recorrência são alternativas. Ativei recorrência e desliguei fatura futura.");
    else setExclusiveHint("");
    const nextForm = {
      ...form,
      recurrence: enabled,
      is_future: enabled ? false : form.is_future,
      invoice_id: enabled ? "" : form.invoice_id,
      day_of_month: enabled ? form.day_of_month || getDayFromDate(form.date) : form.day_of_month,
      recurrence_months: enabled ? form.recurrence_months || "12" : form.recurrence_months
    };
    setForm(nextForm);
    validateField("recurrence", enabled, nextForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = parseTypedAmount(form.amount);
    if (Object.keys(validateForm()).length) return;

    setSaving(true);
    try {
      await onSave({
        data: {
          date: form.date,
          type: form.type,
          amount,
          description: form.description,
          is_future: form.is_future,
          invoice_id: form.invoice_id ? Number(form.invoice_id) : null
        },
        recurrence: form.recurrence
          ? {
              enabled: true,
              day_of_month: Number(form.day_of_month || 1),
              recurrence_months: recurrenceMonths
            }
          : null
      });
    } finally {
      setSaving(false);
    }
  };

  const isExpense = form.type === "expense";
  const recurrenceMonths = clampNumber(form.recurrence_months, 1, 60, 12);
  const recurrenceDay = clampNumber(form.day_of_month || getDayFromDate(form.date), 1, 31, 1);
  const recurrenceEnd = form.date ? formatMonthShort(addMonths(form.date, recurrenceMonths)) : "";

  if (!open) return null;

  return (
    <div className="modal-layer transaction-modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
      <form className="modal-card transaction-modal" onSubmit={handleSubmit}>
        <div className="modal-titlebar">
          <h2>{initial ? "Editar lançamento" : "Novo lançamento"}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="transaction-modal-body">
          <div className="transaction-kind" aria-label="Tipo do lançamento">
            <button type="button" className={isExpense ? "active danger" : ""} onClick={() => setForm({ ...form, type: "expense" })}>
                <ArrowDownCircle size={16} /> GASTO
            </button>
            <button type="button" className={!isExpense ? "active success" : ""} onClick={() => setForm({ ...form, type: "income" })}>
                <ArrowUpCircle size={16} /> GANHO
            </button>
          </div>

          <label className={`amount-field ${errors.amount ? "has-error" : ""}`}>
            <span>Valor</span>
            <div className={`money-input ${isExpense ? "danger" : "success"}`}>
              <span>R$</span>
              <input
                inputMode="numeric"
                value={form.amount.replace(/^R\$\s?/, "")}
                onBlur={() => handleBlur("amount")}
                onChange={(event) => handleAmount(event.target.value)}
                onFocus={(event) => event.target.select()}
                aria-invalid={!!errors.amount}
              />
            </div>
            {errors.amount && <small className="field-error">{errors.amount}</small>}
          </label>

          <label className={errors.date ? "has-error" : ""}>
            <span>Data</span>
            <DateField value={form.date} onBlur={() => handleBlur("date")} onChange={(value) => setField("date", value)} ariaInvalid={!!errors.date} />
            {errors.date && <small className="field-error">{errors.date}</small>}
          </label>

          <label>
            <span>Descrição</span>
            <input placeholder="Ex: mercado, salário, aluguel" value={form.description} onChange={(event) => setField("description", event.target.value)} />
          </label>

          <section className="conditional-section">
            <button className={`switch-row ${form.is_future ? "active" : ""}`} type="button" onClick={toggleFuture}>
              <span><ReceiptText size={16} /> Vincular a uma fatura futura?</span>
              <i aria-hidden="true" />
            </button>

            <div className={`conditional-content ${form.is_future ? "open" : ""}`}>
              <div className={`future-invoice-field ${touched.invoice_id && errors.invoice_id ? "has-error" : ""}`}>
                <InvoiceSelector
                  invoices={invoices}
                  value={form.invoice_id ? { templateId: String(invoices.find((invoice) => String(invoice.id) === String(form.invoice_id))?.template_id ?? ""), invoiceId: String(form.invoice_id) } : null}
                  onChange={(selection) => setField("invoice_id", selection?.invoiceId || "")}
                />
                {touched.invoice_id && errors.invoice_id && <small className="field-error">{errors.invoice_id}</small>}
              </div>
            </div>
          </section>

          {!initial && (
            <section className="conditional-section">
              <button className={`switch-row ${form.recurrence ? "active" : ""}`} type="button" onClick={toggleRecurrence}>
                <span><Repeat2 size={16} /> Lançamento recorrente?</span>
                <i aria-hidden="true" />
              </button>
              {exclusiveHint && <p className="exclusive-hint">{exclusiveHint}</p>}
              <div className={`conditional-content ${form.recurrence ? "open" : ""}`}>
                <div className="recurrence-grid">
                  <label>
                    <span>Repetir por</span>
                    <input type="number" min="1" max="60" value={form.recurrence_months} disabled={!form.recurrence} onChange={(event) => setField("recurrence_months", event.target.value)} />
                  </label>
                  <label className={errors.day_of_month ? "has-error" : ""}>
                    <span>Dia do mês</span>
                    <input type="number" min="1" max="31" value={form.day_of_month} disabled={!form.recurrence} onBlur={() => handleBlur("day_of_month")} onChange={(event) => setField("day_of_month", event.target.value)} aria-invalid={!!errors.day_of_month} />
                    {errors.day_of_month && <small className="field-error">{errors.day_of_month}</small>}
                  </label>
                </div>
                <p className="recurrence-summary">
                  Será lançado todo dia {recurrenceDay} por {recurrenceMonths} meses{recurrenceEnd ? ` (até ${recurrenceEnd})` : ""}
                </p>
              </div>
            </section>
          )}

          <div className="transaction-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
            <button className={`btn transaction-save ${isExpense ? "danger" : "success"}`} type="submit" disabled={saving}>
              {saving ? <><Loader2 className="spin" size={16} /> Salvando...</> : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
