import { Wallet, X } from "lucide-react";
import DateField from "../components/DateField.jsx";
import { useI18n } from "../i18n/index.ts";
import { CREATE_RECEIVABLE_PERSON_VALUE } from "../app/constants.js";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function ReceivableModal({ form, setForm, editing, people, onSubmit, onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const updateForm = (patch) => setForm({ ...form, ...patch });
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
          <div className="receivable-form-row">
            <label><span>{tt("receivables.amount", "Valor")}</span><input inputMode="decimal" placeholder={formatMoney(0, language)} value={form.total_amount} onChange={(event) => updateForm({ total_amount: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={normalizeAmount} required /></label>
            <label><span>{tt("receivables.dueDate", "Vencimento")}</span><DateField value={form.due_date} onChange={(value) => updateForm({ due_date: value })} /></label>
          </div>
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


