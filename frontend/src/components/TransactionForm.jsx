import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Link2, Loader2, Repeat2, X } from "lucide-react";
import DateField from "./DateField.jsx";
import CategorySelect from "./CategorySelect.jsx";
import ExpensePicker from "./ExpensePicker.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, getFormatLocale, parseTypedMoneyInput } from "../utils/format.js";

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
  return parseTypedMoneyInput(value);
}

function formatAmountForEditing(value) {
  return formatTypedMoneyForEditing(value);
}

function formatAmountAsCurrency(value) {
  return formatTypedMoneyAsCurrency(value);
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

function normalizedCategoryName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export default function TransactionForm({
  open,
  initial,
  date,
  categories = [],
  expenseOption,
  expenseOptions = [],
  onManageReceivable,
  onCreateCategory,
  onClose,
  onSave
}) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [form, setForm] = useState({
    date: date || todayIsoDate(),
    type: "expense",
    amount: "",
    description: "",
    category_id: "",
    recurrence: false,
    recurrence_scope: initial?.recurrence_id ? "future" : "single",
    day_of_month: "",
    recurrence_months: "12",
    expense_source_key: ""
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      const initialCategory = categories.find((item) => String(item.id) === String(initial.category_id));
      const initialIsReceivable = ["recebivel", "receivable"].includes(normalizedCategoryName(initialCategory?.name));
      setForm({
        date: initial.date,
        type: initial.type,
        amount: formatMoney(initial.amount),
        description: initial.description || "",
        category_id: initial.category_id ? String(initial.category_id) : "",
        recurrence: false,
        recurrence_scope: initial.recurrence_id && !initialIsReceivable ? "future" : "single",
        day_of_month: "",
        recurrence_months: "12",
        expense_source_key: initial.linked_expense ? `${initial.linked_expense.source_type}:${initial.linked_expense.source_id}` : ""
      });
    } else {
      setForm({
        date: date || todayIsoDate(),
        type: "expense",
        amount: "",
        description: "",
        category_id: "",
        recurrence: false,
        recurrence_scope: "single",
        day_of_month: "",
        recurrence_months: "12",
        expense_source_key: ""
      });
    }
    setErrors({});
    setTouched({});
    setSaving(false);
  }, [initial, date, open, categories]);

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
    if (field === "category_id") {
      const category = categories.find((item) => String(item.id) === String(value));
      const receivableCategory = ["recebivel", "receivable"].includes(normalizedCategoryName(category?.name));
      if (!receivableCategory) nextForm.expense_source_key = "";
      else {
        nextForm.recurrence = false;
        nextForm.recurrence_scope = "single";
      }
    }
    setForm(nextForm);
    if (touched[field]) validateField(field, value, nextForm);
  };

  const setTransactionType = (type) => {
    setForm({ ...form, type, expense_source_key: type === "income" ? form.expense_source_key : "" });
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
    if (form.expense_source_key) {
      const linkedOption = expenseOptions.find((option) => `${option.source_type}:${option.source_id}` === form.expense_source_key);
      const ownAmount = linkedOption?.transaction_ids?.includes(initial?.id) ? Number(initial?.amount || 0) : 0;
      const available = Number(linkedOption?.available_amount || 0) + ownAmount;
      if (!linkedOption || amount > available) nextErrors.expense_link = "O valor excede o disponível neste gasto";
    }
    setTouched({ amount: true, date: true, day_of_month: true });
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

  const toggleRecurrence = () => {
    const enabled = !form.recurrence;
    const nextForm = {
      ...form,
      recurrence: enabled,
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
      const [sourceType, sourceId] = form.expense_source_key ? form.expense_source_key.split(":") : [];
      await onSave({
        data: {
          date: form.date,
          type: form.type,
          amount,
          description: form.description,
          category_id: form.category_id ? Number(form.category_id) : null,
          expense_link: sourceType ? {
            source_type: sourceType,
            source_id: Number(sourceId),
            installment_scope: "single",
            allocation_mode: "total"
          } : null
        },
        recurrence: form.recurrence
          ? {
              enabled: true,
              day_of_month: Number(form.day_of_month || 1),
              recurrence_months: recurrenceMonths
            }
          : null,
        recurrenceUpdate: initial?.recurrence_id && form.recurrence_scope !== "single"
          ? {
              enabled: true,
              id: initial.recurrence_id,
              apply_to: form.recurrence_scope,
              effective_date: initial.date,
              day_of_month: Number(getDayFromDate(form.date) || 1)
            }
          : null
      });
    } finally {
      setSaving(false);
    }
  };

  const isExpense = form.type === "expense";
  const selectedCategory = categories.find((category) => String(category.id) === String(form.category_id));
  const isReceivableCategory = !isExpense && ["recebivel", "receivable"].includes(normalizedCategoryName(selectedCategory?.name));
  const recurrenceMonths = clampNumber(form.recurrence_months, 1, 60, 12);
  const recurrenceDay = clampNumber(form.day_of_month || getDayFromDate(form.date), 1, 31, 1);
  const recurrenceEnd = form.date ? formatMonthShort(addMonths(form.date, recurrenceMonths)) : "";
  const recurrenceTotal = recurrenceMonths + 1;

  if (!open) return null;

  return (
    <div className="modal-layer transaction-modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
      <form className="modal-card transaction-modal" onSubmit={handleSubmit}>
        <div className="modal-titlebar">
          <h2>{initial ? tt("transactionModal.editEntry", "Editar lançamento") : tt("transactionModal.newEntry", "Novo lançamento")}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="transaction-modal-body">
          <div className="transaction-kind" aria-label="Tipo do lançamento">
            <button type="button" className={isExpense ? "active danger" : ""} onClick={() => setTransactionType("expense")}>
                <ArrowDownCircle size={16} /> {tt("transactionModal.expense", "GASTO")}
            </button>
            <button type="button" className={!isExpense ? "active success" : ""} onClick={() => setTransactionType("income")}>
                <ArrowUpCircle size={16} /> {tt("transactionModal.income", "GANHO")}
            </button>
          </div>

          <label className={`amount-field ${errors.amount ? "has-error" : ""}`}>
            <span>{tt("transactionModal.amount", "Valor")}</span>
            <div className={`money-input ${isExpense ? "danger" : "success"}`}>
              <span>R$</span>
              <input
                inputMode="decimal"
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
            <span>{tt("transactionModal.date", "Data")}</span>
            <DateField value={form.date} onBlur={() => handleBlur("date")} onChange={(value) => setField("date", value)} ariaInvalid={!!errors.date} />
            {errors.date && <small className="field-error">{errors.date}</small>}
          </label>

          <label>
            <span>{tt("transactionModal.description", "Descrição")}</span>
            <input placeholder={tt("transactionModal.descriptionPlaceholder", "Ex: mercado, salário, aluguel")} value={form.description} onChange={(event) => setField("description", event.target.value)} />
          </label>

          <label>
            <span>Categoria</span>
            <CategorySelect categories={categories} value={form.category_id} onChange={(value) => setField("category_id", value)} onCreate={onCreateCategory} />
          </label>

          {isReceivableCategory && (
            <section className={`transaction-expense-link ${errors.expense_link ? "has-error" : ""}`}>
              <div className="receivable-link-heading">
                <span><Link2 size={16} /> Associar este recebimento a um gasto</span>
                <small>Encontre a compra pela descrição, fatura, mês ou valor.</small>
              </div>
              <ExpensePicker
                options={expenseOptions}
                value={form.expense_source_key || ""}
                onChange={(key) => {
                  setForm({ ...form, expense_source_key: key });
                  if (errors.expense_link) setErrors({ ...errors, expense_link: null });
                }}
                mode="transaction"
                autoOpen={!initial}
                currentAmount={initial?.amount || 0}
                currentTransactionId={initial?.id || null}
              />
              {errors.expense_link && <small className="field-error">{errors.expense_link}</small>}
            </section>
          )}

          {initial?.type === "expense" && expenseOption && (
            <section className="expense-receivable-action">
              <div>
                <strong><Link2 size={16} /> Recebimento deste gasto</strong>
                <small>
                  {Number(expenseOption.linked_amount || 0) > 0
                    ? `${formatMoney(expenseOption.linked_amount, language)} já associado`
                    : "Associe o valor que outra pessoa devolverá a você."}
                </small>
              </div>
              {(expenseOption.receivable_ids?.length > 0 || Number(expenseOption.available_amount || 0) > 0) && (
                <button className="btn btn-ghost compact" type="button" onClick={() => onManageReceivable?.(expenseOption)}>
                  {expenseOption.receivable_ids?.length ? "Editar recebível" : "Associar recebível"}
                </button>
              )}
            </section>
          )}

          {initial?.recurrence_id && !isReceivableCategory && (
            <section className="conditional-section recurrence-edit-scope">
              <div className="scope-heading">
                <span><Repeat2 size={16} /> {tt("transactionModal.applyRecurringEdit", "Como aplicar?")}</span>
                <small>{tt("transactionModal.recurringEditHint", "Este lançamento faz parte de uma recorrência.")}</small>
              </div>
              <div className="scope-options">
                <button
                  type="button"
                  className={form.recurrence_scope === "single" ? "active" : ""}
                  onClick={() => setField("recurrence_scope", "single")}
                >
                  {tt("transactionModal.onlyThisEntry", "Só este lançamento")}
                </button>
                <button
                  type="button"
                  className={form.recurrence_scope === "future" ? "active" : ""}
                  onClick={() => setField("recurrence_scope", "future")}
                >
                  {tt("transactionModal.thisAndNext", "Este e próximos")}
                </button>
                <button
                  type="button"
                  className={form.recurrence_scope === "all" ? "active" : ""}
                  onClick={() => setField("recurrence_scope", "all")}
                >
                  {tt("transactionModal.allRecurringEntries", "Toda recorrência")}
                </button>
              </div>
            </section>
          )}

          {!initial && !isReceivableCategory && (
            <section className="conditional-section">
              <button className={`switch-row ${form.recurrence ? "active" : ""}`} type="button" onClick={toggleRecurrence}>
                <span><Repeat2 size={16} /> {tt("transactionModal.recurringEntry", "Lançamento recorrente?")}</span>
                <i aria-hidden="true" />
              </button>
              <div className={`conditional-content ${form.recurrence ? "open" : ""}`}>
                <div className="recurrence-grid">
                  <label>
                    <span>{tt("transactionModal.repeatFor", "Parcelas adicionais")}</span>
                    <input type="number" min="1" max="60" value={form.recurrence_months} disabled={!form.recurrence} onChange={(event) => setField("recurrence_months", event.target.value)} />
                  </label>
                  <label className={errors.day_of_month ? "has-error" : ""}>
                    <span>{tt("transactionModal.dayOfMonth", "Dia do mês")}</span>
                    <input type="number" min="1" max="31" value={form.day_of_month} disabled={!form.recurrence} onBlur={() => handleBlur("day_of_month")} onChange={(event) => setField("day_of_month", event.target.value)} aria-invalid={!!errors.day_of_month} />
                    {errors.day_of_month && <small className="field-error">{errors.day_of_month}</small>}
                  </label>
                </div>
                <p className="recurrence-summary">
                  {tt(
                    "transactionModal.recurrenceSummary",
                    `Total: ${recurrenceTotal} parcelas (1 atual + ${recurrenceMonths} futuras). Todo dia ${recurrenceDay}${recurrenceEnd ? `, até ${recurrenceEnd}` : ""}.`,
                    {
                      day: recurrenceDay,
                      months: recurrenceMonths,
                      total: recurrenceTotal,
                      until: recurrenceEnd ? t("transactionModal.recurrenceUntil", { date: recurrenceEnd }) : ""
                    }
                  )}
                </p>
              </div>
            </section>
          )}

          <div className="transaction-modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
            <button className={`btn transaction-save ${isExpense ? "danger" : "success"}`} type="submit" disabled={saving}>
              {saving ? <><Loader2 className="spin" size={16} /> {tt("transactionModal.saving", "Salvando...")}</> : tt("actions.save", "Salvar")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
