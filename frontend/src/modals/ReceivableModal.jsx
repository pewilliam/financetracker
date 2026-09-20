import { useMemo } from "react";
import { Layers3, Link2, Minus, Plus, Wallet, X } from "lucide-react";
import DateField from "../components/DateField.jsx";
import CategorySelect from "../components/CategorySelect.jsx";
import ExpensePicker from "../components/ExpensePicker.jsx";
import PersonPicker from "../components/PersonPicker.jsx";
import { useI18n } from "../i18n/index.ts";
import { CREATE_RECEIVABLE_PERSON_VALUE } from "../app/constants.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

function addMonths(isoDate, amount) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthIndex = year * 12 + (month - 1) + amount;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = (monthIndex % 12) + 1;
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  const nextDay = Math.min(day, lastDay);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function allocateAmounts(total, count, mode) {
  const size = Math.max(count, 1);
  if (mode === "per_installment") {
    return Array.from({ length: size }, () => money(total));
  }
  const base = money(total / size);
  const values = Array.from({ length: size }, () => base);
  values[size - 1] = money(total - values.slice(0, -1).reduce((sum, amount) => sum + amount, 0));
  return values;
}

function resolveExpenseOption(selectedExpense, expenseOptions) {
  if (!selectedExpense) return null;
  if (selectedExpense.source_type === "installment_item" && selectedExpense.purchase_id) {
    return expenseOptions.find((option) => option.source_type === "installment_purchase" && option.source_id === selectedExpense.purchase_id) || selectedExpense;
  }
  return selectedExpense;
}

function installmentItemsForPreview(selectedExpense, expenseOptions) {
  if (!selectedExpense) return [];
  if (selectedExpense.source_type === "installment_purchase") {
    return expenseOptions
      .filter((option) => option.source_type === "installment_item" && option.purchase_id === selectedExpense.source_id)
      .sort((left, right) => Number(left.installment_number) - Number(right.installment_number));
  }
  if (selectedExpense.source_type === "installment_item") {
    return expenseOptions
      .filter((option) => (
        option.source_type === "installment_item"
        && option.purchase_id === selectedExpense.purchase_id
        && Number(option.installment_number) >= Number(selectedExpense.installment_number)
      ))
      .sort((left, right) => Number(left.installment_number) - Number(right.installment_number));
  }
  return [];
}

function resolveInstallmentAmounts(installmentAmounts, count, typedAmount, allocationMode, language) {
  if (Array.isArray(installmentAmounts) && installmentAmounts.length === count) {
    return installmentAmounts.map((value) => money(parseTypedMoneyInput(value, language)));
  }
  return allocateAmounts(typedAmount, count, allocationMode);
}

function buildReceivablePreview({
  seriesCount,
  allocationMode,
  typedAmount,
  dueDate,
  installmentAmounts,
  language
}) {
  if (!dueDate || !typedAmount || typedAmount <= 0) return [];
  const count = Math.max(Number(seriesCount) || 1, 1);
  const amounts = resolveInstallmentAmounts(installmentAmounts, count, typedAmount, allocationMode, language);
  return amounts.map((amount, index) => ({
    key: `row-${index}`,
    labelNumber: index + 1,
    labelTotal: count,
    amount,
    dueDate: addMonths(dueDate, index)
  }));
}

function defaultSeriesCountForExpense(option, expenseOptions) {
  if (!option) return 1;
  if (option.source_type === "installment_purchase") return Math.max(Number(option.installment_count || 1), 1);
  if (option.source_type === "installment_item") {
    const remaining = expenseOptions.filter((item) => (
      item.source_type === "installment_item"
      && item.purchase_id === option.purchase_id
      && Number(item.installment_number) >= Number(option.installment_number)
    )).length;
    return Math.max(remaining || Number(option.installment_count || 1), 1);
  }
  return 1;
}

export default function ReceivableModal({ form, setForm, editing, receivables = [], people, categories = [], expenseOptions = [], onCreateCategory, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const updateForm = (patch) => setForm({ ...form, ...patch });
  const selectedExpense = expenseOptions.find((option) => `${option.source_type}:${option.source_id}` === form.expense_source_key);
  const displayExpense = resolveExpenseOption(selectedExpense, expenseOptions);
  const seriesCount = Math.max(Number(form.series_count) || 1, 1);
  const typedAmount = parseTypedMoneyInput(form.total_amount, language);
  const scopedInstallmentItems = installmentItemsForPreview(selectedExpense, expenseOptions);
  const seriesMates = editing?.series_id
    ? receivables.filter((item) => item.series_id === editing.series_id)
    : editing ? [editing] : [];
  const seriesCreditIds = new Set(seriesMates.map((item) => item.id));
  const availableCredit = (() => {
    if (!selectedExpense || !editing) return 0;
    if (displayExpense?.source_type === "installment_purchase") {
      return seriesMates.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    }
    if (scopedInstallmentItems.length) {
      return scopedInstallmentItems.reduce((sum, option) => {
        const credited = (option.receivable_ids || [])
          .filter((id) => seriesCreditIds.has(id))
          .reduce((inner, id) => {
            const mate = seriesMates.find((item) => item.id === id);
            return inner + Number(mate?.total_amount || 0);
          }, 0);
        return sum + credited;
      }, 0);
    }
    if (selectedExpense.receivable_ids?.includes(editing.id) || displayExpense?.receivable_ids?.includes(editing.id)) {
      return seriesMates.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    }
    return 0;
  })();
  const installmentAvailable = displayExpense?.source_type === "installment_purchase"
    ? Number(displayExpense.available_amount || 0) + availableCredit
    : selectedExpense?.source_type === "installment_item"
      ? scopedInstallmentItems.reduce((sum, option) => sum + Number(option.available_amount || 0), 0) + availableCredit
      : Number((displayExpense || selectedExpense)?.available_amount || 0) + availableCredit;

  const previewRows = useMemo(() => buildReceivablePreview({
    seriesCount,
    allocationMode: form.allocation_mode,
    typedAmount,
    dueDate: form.due_date,
    installmentAmounts: form.installment_amounts,
    language
  }), [
    seriesCount,
    form.allocation_mode,
    form.installment_amounts,
    typedAmount,
    form.due_date,
    language
  ]);

  const previewTotal = previewRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const currentAmountLabels = () => (
    form.installment_amounts?.length === seriesCount
      ? [...form.installment_amounts]
      : allocateAmounts(typedAmount, seriesCount, form.allocation_mode).map((amount) => formatMoney(amount, language))
  );

  const setAllocationMode = (mode) => {
    const nextAmount = mode === "per_installment"
      ? money((installmentAvailable || Number(displayExpense?.amount || selectedExpense?.amount || typedAmount || 0)) / Math.max(seriesCount, 1))
      : installmentAvailable || Number(displayExpense?.available_amount || selectedExpense?.available_amount || displayExpense?.amount || selectedExpense?.amount || 0);
    updateForm({ allocation_mode: mode, total_amount: formatMoney(nextAmount, language), installment_amounts: [] });
  };

  const selectExpense = (key) => {
    const option = expenseOptions.find((item) => `${item.source_type}:${item.source_id}` === key);
    if (!option) {
      updateForm({ expense_source_key: "", installment_scope: "single", series_count: Math.max(Number(form.series_count) || 1, 1) });
      return;
    }
    const purchaseOption = resolveExpenseOption(option, expenseOptions);
    const resolvedKey = purchaseOption && purchaseOption.source_type === "installment_purchase"
      ? `${purchaseOption.source_type}:${purchaseOption.source_id}`
      : key;
    const resolved = expenseOptions.find((item) => `${item.source_type}:${item.source_id}` === resolvedKey) || option;
    const scope = resolved.source_type === "installment_purchase" ? "all" : resolved.source_type === "installment_item" ? "remaining" : "single";
    const nextCount = defaultSeriesCountForExpense(resolved, expenseOptions);
    const available = resolved.source_type === "installment_purchase" || resolved.source_type === "installment_item"
      ? (resolved.source_type === "installment_purchase"
        ? Number(resolved.available_amount || resolved.amount || 0)
        : expenseOptions
            .filter((item) => item.source_type === "installment_item" && item.purchase_id === resolved.purchase_id && Number(item.installment_number) >= Number(resolved.installment_number))
            .reduce((sum, item) => sum + Number(item.available_amount || 0), 0))
      : Number(resolved.available_amount || resolved.amount || 0);
    updateForm({
      expense_source_key: resolvedKey,
      installment_scope: scope,
      series_count: nextCount,
      total_amount: formatMoney(available || resolved.amount, language),
      due_date: form.due_date || resolved.date || form.due_date,
      description: form.description.trim() ? form.description : resolved.description,
      category_ids: form.category_ids?.length
        ? form.category_ids
        : (resolved.category_ids?.length ? resolved.category_ids : resolved.category_id ? [resolved.category_id] : []).map(String),
      installment_amounts: []
    });
  };

  const setSeriesCount = (next) => {
    const count = Math.min(60, Math.max(1, Number(next) || 1));
    updateForm({ series_count: count, installment_amounts: [] });
  };

  const setTotalAmount = (value, { resetInstallments = true } = {}) => {
    updateForm({
      total_amount: value,
      ...(resetInstallments ? { installment_amounts: [] } : {})
    });
  };

  const setInstallmentAmount = (index, value) => {
    const next = currentAmountLabels();
    next[index] = value;
    updateForm({ installment_amounts: next });
  };

  const normalizeAmount = () => {
    if (!form.total_amount) return;
    updateForm({ total_amount: formatTypedMoneyAsCurrency(form.total_amount, language) });
  };

  const normalizeInstallmentAmount = (index) => {
    const next = currentAmountLabels();
    if (!next[index]) return;
    next[index] = formatTypedMoneyAsCurrency(next[index], language);
    const patch = { installment_amounts: next };
    if (form.allocation_mode !== "per_installment") {
      const sum = next.reduce((total, value) => total + (parseTypedMoneyInput(value, language) || 0), 0);
      if (sum > 0) patch.total_amount = formatMoney(sum, language);
    }
    updateForm(patch);
  };

  const submit = (event) => {
    event.preventDefault();
    const hasPerson = form.person_id && (form.person_id !== CREATE_RECEIVABLE_PERSON_VALUE || form.person_name.trim());
    const installmentAmounts = previewRows.map((row) => Number(row.amount) || 0);
    if (!hasPerson || !form.description.trim() || !parseTypedMoneyInput(form.total_amount, language) || !form.due_date) return;
    if (seriesCount > 1 && installmentAmounts.some((amount) => amount <= 0)) return;
    onSubmit({
      ...form,
      series_count: seriesCount,
      installment_amounts: seriesCount > 1 ? installmentAmounts : undefined
    });
  };

  return (
    <div className="modal-layer receivable-action-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="modal-card invoice-modal receivable-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="receivable-modal-title">
        <header className="transaction-entry-titlebar compact">
          <span className="transaction-entry-icon"><Wallet size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{language === "en-US" ? "RECEIVABLES" : "RECEBÍVEIS"}</p>
            <h2 id="receivable-modal-title">{editing ? tt("receivables.edit", "Editar conta") : tt("receivables.new", "Nova conta")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}>
            <X size={18} />
          </button>
        </header>
        <div className="invoice-modal-body">
          <div className="field-label">
            <span>{tt("receivables.person", "Pessoa")}</span>
            <PersonPicker
              people={people}
              value={form.person_id || ""}
              personName={form.person_name || ""}
              required
              onChange={(next) => updateForm(next)}
            />
          </div>
          <div className="field-label"><span>{tt("receivables.description", "Descrição")}</span><input value={form.description} onChange={(event) => updateForm({ description: event.target.value })} required /></div>
          <section className={`receivable-expense-link ${selectedExpense || displayExpense ? "active" : ""}`}>
            <div className="receivable-link-heading">
              <span><Link2 size={16} /> Associar a um gasto</span>
              <small>Opcional · use para identificar de qual compra vem este recebimento.</small>
            </div>
            <ExpensePicker
              options={expenseOptions}
              value={form.expense_source_key || ""}
              onChange={selectExpense}
              mode="receivable"
              currentAmount={editing?.total_amount || 0}
              currentReceivableId={editing?.id || null}
              displayedAvailable={selectedExpense || displayExpense ? installmentAvailable : null}
            />
          </section>

          <section className="receivable-installment-settings">
            <div className="receivable-link-heading">
              <span><Layers3 size={16} /> {tt("receivables.howPaid", "Como será o pagamento?")}</span>
            </div>
            <div className="receivable-series-controls">
              <div className="field-label receivable-series-count">
                <span>{tt("receivables.seriesCount", "Quantidade de recebíveis")}</span>
                <div className="receivable-count-stepper" role="group" aria-label={tt("receivables.seriesCount", "Quantidade de recebíveis")}>
                  <button type="button" onClick={() => setSeriesCount(seriesCount - 1)} aria-label={tt("receivables.decreaseCount", "Diminuir quantidade")} disabled={seriesCount <= 1}>
                    <Minus size={16} />
                  </button>
                  <input
                    inputMode="numeric"
                    value={seriesCount}
                    onChange={(event) => setSeriesCount(event.target.value.replace(/\D/g, ""))}
                  />
                  <button type="button" onClick={() => setSeriesCount(seriesCount + 1)} aria-label={tt("receivables.increaseCount", "Aumentar quantidade")}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              {seriesCount > 1 && (
                <div className="field-label receivable-series-allocation">
                  <span>{tt("receivables.allocation", "Distribuição")}</span>
                  <div className="receivable-choice-row receivable-allocation-toggle">
                    <button className={form.allocation_mode === "total" ? "active" : ""} type="button" onClick={() => setAllocationMode("total")}>{tt("receivables.splitTotal", "Dividir o valor total")}</button>
                    <button className={form.allocation_mode === "per_installment" ? "active" : ""} type="button" onClick={() => setAllocationMode("per_installment")}>{tt("receivables.samePerInstallment", "Mesmo valor por parcela")}</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="receivable-form-row">
            <div className="field-label">
              <span>
                {form.allocation_mode === "per_installment" && seriesCount > 1
                  ? tt("receivables.amountPerInstallment", "Valor por parcela")
                  : tt("receivables.amount", "Valor")}
              </span>
              <input inputMode="decimal" placeholder={formatMoney(0, language)} value={form.total_amount} onChange={(event) => setTotalAmount(formatTypedMoneyForEditing(event.target.value, language))} onBlur={normalizeAmount} required />
            </div>
            <div className="field-label">
              <span>
                {seriesCount > 1
                  ? tt("receivables.firstDueDate", "1º vencimento")
                  : tt("receivables.dueDate", "Vencimento")}
              </span>
              <DateField value={form.due_date} onChange={(value) => updateForm({ due_date: value })} />
            </div>
          </div>

          {previewRows.length > 0 && (
            <section className="receivable-preview" aria-label={tt("receivables.preview", "Prévia dos recebíveis")}>
              <header>
                <div>
                  <h3>{tt("receivables.preview", "Prévia dos recebíveis")}</h3>
                  <p>
                    {previewRows.length === 1
                      ? (editing
                        ? tt("receivables.previewOneUpdate", "1 recebível será atualizado.")
                        : tt("receivables.previewOne", "1 recebível será criado."))
                      : (editing
                        ? tt("receivables.previewManyUpdate", `${previewRows.length} recebíveis serão atualizados.`, { count: previewRows.length })
                        : tt("receivables.previewMany", `${previewRows.length} recebíveis serão criados.`, { count: previewRows.length }))}
                    {previewRows.length > 1 ? ` ${tt("receivables.previewHint", "Você pode ajustar o valor de cada parcela.")}` : ""}
                  </p>
                </div>
                <strong>{formatMoney(previewTotal, language)}</strong>
              </header>
              <div className="receivable-preview-list">
                {previewRows.map((row, index) => {
                  const amountValue = form.installment_amounts?.length === seriesCount
                    ? form.installment_amounts[index]
                    : formatMoney(row.amount, language);
                  return (
                    <div className="receivable-preview-row" key={row.key}>
                      <span>
                        <small>{tt("receivables.installment", "Parcela")}</small>
                        <strong>{row.labelNumber}/{row.labelTotal}</strong>
                      </span>
                      <span>
                        <small>{tt("receivables.dueDate", "Vencimento")}</small>
                        <strong>{formatDateShort(row.dueDate, language)}</strong>
                      </span>
                      <label>
                        <small>{tt("receivables.amount", "Valor")}</small>
                        {seriesCount > 1 ? (
                          <input
                            inputMode="decimal"
                            value={amountValue}
                            onChange={(event) => setInstallmentAmount(index, formatTypedMoneyForEditing(event.target.value, language))}
                            onBlur={() => normalizeInstallmentAmount(index)}
                            aria-label={tt("receivables.editInstallmentAmount", `Valor da parcela ${row.labelNumber}/${row.labelTotal}`, { current: row.labelNumber, total: row.labelTotal })}
                          />
                        ) : (
                          <strong>{formatMoney(row.amount, language)}</strong>
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="invoice-field"><span>Categorias do recebimento</span><CategorySelect categories={categories} values={form.category_ids || []} onChange={(value) => updateForm({ category_ids: value })} onCreate={onCreateCategory} /></div>
          <div className="field-label"><span>{tt("receivables.notes", "Observações")}</span><textarea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} rows="3" /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary">{tt("actions.save", "Salvar")}</button>
        </div>
      </form>
    </div>
  );
}
