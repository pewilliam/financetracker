import { Layers3, Link2, Wallet, X } from "lucide-react";
import DateField from "../components/DateField.jsx";
import CategorySelect from "../components/CategorySelect.jsx";
import ExpensePicker from "../components/ExpensePicker.jsx";
import { useI18n } from "../i18n/index.ts";
import { CREATE_RECEIVABLE_PERSON_VALUE } from "../app/constants.js";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function ReceivableModal({ form, setForm, editing, people, categories = [], expenseOptions = [], onCreateCategory, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const updateForm = (patch) => setForm({ ...form, ...patch });
  const selectedExpense = expenseOptions.find((option) => `${option.source_type}:${option.source_id}` === form.expense_source_key);
  const installmentSource = selectedExpense && ["installment_purchase", "installment_item"].includes(selectedExpense.source_type);
  const installmentCount = selectedExpense?.source_type === "installment_item"
    ? Math.max(Number(selectedExpense.installment_count || 1) - Number(selectedExpense.installment_number || 1) + 1, 1)
    : Number(selectedExpense?.installment_count || 1);
  const effectiveInstallmentCount = form.installment_scope === "single" ? 1 : installmentCount;
  const typedAmount = parseTypedMoneyInput(form.total_amount, language);
  const installmentAvailable = selectedExpense?.source_type === "installment_item" && form.installment_scope !== "single"
    ? expenseOptions
        .filter((option) => option.source_type === "installment_item" && option.purchase_id === selectedExpense.purchase_id && Number(option.installment_number) >= Number(selectedExpense.installment_number))
        .reduce((sum, option) => sum + Number(option.available_amount || 0), 0)
    : Number(selectedExpense?.available_amount || 0);

  const setAllocationMode = (mode) => {
    const nextAmount = mode === "per_installment"
      ? selectedExpense?.source_type === "installment_purchase"
        ? Number(selectedExpense.amount || 0) / Math.max(effectiveInstallmentCount, 1)
        : Number(selectedExpense?.amount || 0)
      : installmentAvailable || Number(selectedExpense?.available_amount || selectedExpense?.amount || 0);
    updateForm({ allocation_mode: mode, total_amount: formatMoney(nextAmount, language) });
  };

  const selectExpense = (key) => {
    const option = expenseOptions.find((item) => `${item.source_type}:${item.source_id}` === key);
    if (!option) {
      updateForm({ expense_source_key: "", installment_scope: "single" });
      return;
    }
    const scope = option.source_type === "installment_purchase" ? "all" : option.source_type === "installment_item" ? "remaining" : "single";
    const available = option.source_type === "installment_item"
      ? expenseOptions
          .filter((item) => item.source_type === "installment_item" && item.purchase_id === option.purchase_id && Number(item.installment_number) >= Number(option.installment_number))
          .reduce((sum, item) => sum + Number(item.available_amount || 0), 0)
      : Number(option.available_amount || option.amount || 0);
    updateForm({
      expense_source_key: key,
      installment_scope: scope,
      total_amount: formatMoney(available || option.amount, language),
      due_date: option.date || form.due_date,
      description: form.description.trim() ? form.description : option.description,
      category_id: form.category_id || (option.category_id ? String(option.category_id) : "")
    });
  };

  const setInstallmentScope = (scope) => {
    const ownAmount = editing?.linked_expense?.source_type === "installment_item" && editing.linked_expense.source_id === selectedExpense?.source_id
      ? Number(editing.total_amount || 0)
      : 0;
    const amount = scope === "single"
      ? Number(selectedExpense?.available_amount || 0) + ownAmount
      : installmentAvailable + ownAmount;
    updateForm({ installment_scope: scope, total_amount: formatMoney(amount || selectedExpense?.amount || 0, language) });
  };
  const normalizeAmount = () => {
    if (!form.total_amount) return;
    updateForm({ total_amount: formatTypedMoneyAsCurrency(form.total_amount, language) });
  };

  const submit = (event) => {
    event.preventDefault();
    const hasPerson = form.person_id && (form.person_id !== CREATE_RECEIVABLE_PERSON_VALUE || form.person_name.trim());
    if (!hasPerson || !form.description.trim() || !parseTypedMoneyInput(form.total_amount, language) || !form.due_date) return;
    onSubmit(form);
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="modal-card invoice-modal receivable-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <div className="modal-icon"><Wallet size={22} /></div>
          <div><p className="eyebrow">{tt("receivables.title", "Recebíveis")}</p><h2>{editing ? tt("receivables.edit", "Editar conta") : tt("receivables.new", "Nova conta")}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-modal-body">
          <label>
            <span>{tt("receivables.person", "Pessoa")}</span>
            <select
              value={form.person_id || ""}
              onChange={(event) => updateForm({ person_id: event.target.value, person_name: event.target.value === CREATE_RECEIVABLE_PERSON_VALUE ? "" : form.person_name })}
              required
            >
              <option value="">{tt("receivables.selectPerson", "Selecione uma pessoa")}</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              <option value={CREATE_RECEIVABLE_PERSON_VALUE}>{tt("receivables.createPerson", "+ Cadastrar nova pessoa")}</option>
            </select>
          </label>
          {form.person_id === CREATE_RECEIVABLE_PERSON_VALUE && (
            <label><span>{tt("receivables.newPersonName", "Nome da pessoa")}</span><input value={form.person_name} onChange={(event) => updateForm({ person_name: event.target.value })} required /></label>
          )}
          <label><span>{tt("receivables.description", "Descrição")}</span><input value={form.description} onChange={(event) => updateForm({ description: event.target.value })} required /></label>
          <section className={`receivable-expense-link ${selectedExpense ? "active" : ""}`}>
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
            />
            {installmentSource && (
              <div className="receivable-installment-settings">
                <div className="receivable-link-heading">
                  <span><Layers3 size={16} /> Como será o pagamento?</span>
                  <small>Os vencimentos acompanharão as faturas da compra.</small>
                </div>
                {selectedExpense.source_type === "installment_item" && (
                  <div className="receivable-choice-row">
                    <button className={form.installment_scope === "single" ? "active" : ""} type="button" onClick={() => setInstallmentScope("single")}>Só esta parcela</button>
                    <button className={form.installment_scope === "remaining" ? "active" : ""} type="button" onClick={() => setInstallmentScope("remaining")}>Esta e as próximas</button>
                  </div>
                )}
                {effectiveInstallmentCount > 1 && (
                  <div className="receivable-choice-row">
                    <button className={form.allocation_mode === "total" ? "active" : ""} type="button" onClick={() => setAllocationMode("total")}>Dividir o valor total</button>
                    <button className={form.allocation_mode === "per_installment" ? "active" : ""} type="button" onClick={() => setAllocationMode("per_installment")}>Mesmo valor por parcela</button>
                  </div>
                )}
                <p className="receivable-installment-preview">
                  {form.allocation_mode === "per_installment" && effectiveInstallmentCount > 1
                    ? `${effectiveInstallmentCount} recebíveis de ${formatMoney(typedAmount, language)} (total ${formatMoney(typedAmount * effectiveInstallmentCount, language)}).`
                    : `${effectiveInstallmentCount} ${effectiveInstallmentCount === 1 ? "recebível" : "recebíveis"}; ${formatMoney(typedAmount, language)} será dividido proporcionalmente entre as parcelas.`}
                </p>
              </div>
            )}
          </section>
          <div className="receivable-form-row">
            <label><span>{tt("receivables.amount", "Valor")}</span><input inputMode="decimal" placeholder={formatMoney(0, language)} value={form.total_amount} onChange={(event) => updateForm({ total_amount: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={normalizeAmount} required /></label>
            <label><span>{tt("receivables.dueDate", "Vencimento")}</span><DateField value={form.due_date} onChange={(value) => updateForm({ due_date: value })} /></label>
          </div>
          <label><span>Categoria do recebimento</span><CategorySelect categories={categories} value={form.category_id} onChange={(value) => updateForm({ category_id: value })} onCreate={onCreateCategory} /></label>
          <label><span>{tt("receivables.notes", "Observações")}</span><textarea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} rows="3" /></label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary">{tt("actions.save", "Salvar")}</button>
        </div>
      </form>
    </div>
  );
}


