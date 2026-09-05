import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarRange, Layers3, Loader2, Plus, Trash2, X } from "lucide-react";
import CategorySelect from "../components/CategorySelect.jsx";
import DateField from "../components/DateField.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

const WEEKDAYS = [
  { value: 0, pt: "Seg", en: "Mon" },
  { value: 1, pt: "Ter", en: "Tue" },
  { value: 2, pt: "Qua", en: "Wed" },
  { value: 3, pt: "Qui", en: "Thu" },
  { value: 4, pt: "Sex", en: "Fri" },
  { value: 5, pt: "Sáb", en: "Sat" },
  { value: 6, pt: "Dom", en: "Sun" },
];

let nextRuleId = 1;

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (!year || !month || !day || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function defaultRule() {
  return {
    id: nextRuleId++,
    description: "",
    amount: "",
    weekdays: [0, 1, 2, 3, 4],
  };
}

function initialForm(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start_date: isoDate(year, month, 1),
    end_date: isoDate(year, month, lastDay),
    type: "expense",
    category_ids: [],
    rules: [defaultRule()],
  };
}

function buildEntries(form) {
  const start = parseIsoDate(form.start_date);
  const end = parseIsoDate(form.end_date);
  if (!start || !end || end < start) return [];

  const entries = [];
  const cursor = new Date(start);
  let traversedDays = 0;
  while (cursor <= end && traversedDays < 366) {
    const weekday = (cursor.getDay() + 6) % 7;
    const date = isoDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    form.rules.forEach((rule) => {
      const amount = parseTypedMoneyInput(rule.amount);
      if (rule.description.trim() && amount > 0 && rule.weekdays.includes(weekday)) {
        entries.push({
          date,
          description: rule.description.trim(),
          amount,
        });
      }
    });
    cursor.setDate(cursor.getDate() + 1);
    traversedDays += 1;
  }
  return entries;
}

export default function BatchTransactionModal({ open, year, month, categories = [], onCreateCategory, onClose, onSave }) {
  const { language } = useI18n();
  const english = language === "en-US";
  const copy = (pt, en) => english ? en : pt;
  const [form, setForm] = useState(() => initialForm(year, month));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(year, month));
    setErrors({});
    setSaving(false);
  }, [open, year, month]);

  const entries = useMemo(() => buildEntries(form), [form]);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);
  const visibleEntries = entries.slice(0, 5);

  if (!open) return null;

  const updateRule = (ruleId, field, value) => {
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule) => rule.id === ruleId ? { ...rule, [field]: value } : rule),
    }));
    setErrors((current) => ({ ...current, [`rule_${ruleId}_${field}`]: null, batch: null }));
  };

  const toggleWeekday = (rule, weekday) => {
    const weekdays = rule.weekdays.includes(weekday)
      ? rule.weekdays.filter((value) => value !== weekday)
      : [...rule.weekdays, weekday].sort((left, right) => left - right);
    updateRule(rule.id, "weekdays", weekdays);
  };

  const addRule = () => {
    setForm((current) => current.rules.length >= 20 ? current : ({ ...current, rules: [...current.rules, defaultRule()] }));
  };

  const removeRule = (ruleId) => {
    setForm((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== ruleId) }));
  };

  const validate = () => {
    const next = {};
    const start = parseIsoDate(form.start_date);
    const end = parseIsoDate(form.end_date);
    if (!start) next.start_date = copy("Informe uma data inicial válida", "Enter a valid start date");
    if (!end) next.end_date = copy("Informe uma data final válida", "Enter a valid end date");
    if (start && end && end < start) next.end_date = copy("A data final deve vir depois da inicial", "End date must be after start date");
    if (start && end && (end - start) / 86400000 >= 366) next.end_date = copy("O período máximo é de 366 dias", "The maximum period is 366 days");
    form.rules.forEach((rule) => {
      if (!rule.description.trim()) next[`rule_${rule.id}_description`] = copy("Informe uma descrição", "Enter a description");
      if (parseTypedMoneyInput(rule.amount) <= 0) next[`rule_${rule.id}_amount`] = copy("Informe um valor maior que zero", "Enter an amount greater than zero");
      if (!rule.weekdays.length) next[`rule_${rule.id}_weekdays`] = copy("Escolha ao menos um dia", "Choose at least one day");
    });
    if (!entries.length && !Object.keys(next).length) next.batch = copy("Estas regras não geram lançamentos no período", "These rules generate no entries in this period");
    if (entries.length > 1000) next.batch = copy("Reduza o período ou as regras para no máximo 1.000 lançamentos", "Reduce the period or rules to at most 1,000 entries");
    setErrors(next);
    return !Object.keys(next).length;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        start_date: form.start_date,
        end_date: form.end_date,
        type: form.type,
        category_ids: form.category_ids.map(Number),
        rules: form.rules.map((rule) => ({
          description: rule.description.trim(),
          amount: parseTypedMoneyInput(rule.amount),
          weekdays: rule.weekdays,
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer batch-transaction-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={copy("Fechar", "Close")} />
      <form className="modal-card batch-transaction-modal" onSubmit={submit}>
        <header className="batch-modal-titlebar">
          <span className="batch-modal-icon"><Layers3 size={21} /></span>
          <div>
            <p>{copy("PLANEJAMENTO RÁPIDO", "QUICK PLANNING")}</p>
            <h2>{copy("Adicionar transações em lote", "Add transactions in bulk")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={copy("Fechar", "Close")}><X size={18} /></button>
        </header>

        <div className="batch-modal-content">
          <main className="batch-config">
            <section className="batch-section">
              <div className="batch-section-heading">
                <span>1</span>
                <div><strong>{copy("Período e tipo", "Period and type")}</strong><small>{copy("Defina quando as regras serão aplicadas.", "Set when the rules will be applied.")}</small></div>
              </div>
              <div className="batch-period-grid">
                <label className={errors.start_date ? "has-error" : ""}>
                  <span>{copy("Começa em", "Starts on")}</span>
                  <DateField value={form.start_date} onChange={(value) => { setForm({ ...form, start_date: value }); setErrors({ ...errors, start_date: null, batch: null }); }} ariaInvalid={!!errors.start_date} />
                  {errors.start_date && <small className="field-error">{errors.start_date}</small>}
                </label>
                <label className={errors.end_date ? "has-error" : ""}>
                  <span>{copy("Termina em", "Ends on")}</span>
                  <DateField value={form.end_date} onChange={(value) => { setForm({ ...form, end_date: value }); setErrors({ ...errors, end_date: null, batch: null }); }} ariaInvalid={!!errors.end_date} />
                  {errors.end_date && <small className="field-error">{errors.end_date}</small>}
                </label>
              </div>
              <div className="batch-kind" aria-label={copy("Tipo dos lançamentos", "Entry type")}>
                <button type="button" className={form.type === "expense" ? "active danger" : ""} onClick={() => setForm({ ...form, type: "expense" })}><ArrowDownCircle size={16} /> {copy("GASTOS", "EXPENSES")}</button>
                <button type="button" className={form.type === "income" ? "active success" : ""} onClick={() => setForm({ ...form, type: "income" })}><ArrowUpCircle size={16} /> {copy("GANHOS", "INCOME")}</button>
              </div>
              <label className="batch-category-field">
                <span>{copy("Categoria para todos", "Category for all")}</span>
                <CategorySelect categories={categories} values={form.category_ids} onChange={(value) => setForm({ ...form, category_ids: value })} onCreate={onCreateCategory} />
              </label>
            </section>

            <section className="batch-section">
              <div className="batch-section-heading">
                <span>2</span>
                <div><strong>{copy("Regras semanais", "Weekly rules")}</strong><small>{copy("Cada regra vira um lançamento nos dias escolhidos.", "Each rule becomes an entry on the chosen days.")}</small></div>
              </div>
              <div className="batch-rules">
                {form.rules.map((rule, index) => (
                  <article className="batch-rule-card" key={rule.id}>
                    <div className="batch-rule-head">
                      <strong>{copy("Regra", "Rule")} {index + 1}</strong>
                      {form.rules.length > 1 && <button type="button" onClick={() => removeRule(rule.id)} aria-label={copy("Remover regra", "Remove rule")}><Trash2 size={15} /></button>}
                    </div>
                    <div className="batch-rule-fields">
                      <label className={errors[`rule_${rule.id}_description`] ? "has-error" : ""}>
                        <span>{copy("Descrição", "Description")}</span>
                        <input value={rule.description} placeholder={copy("Ex: Ônibus — ida", "Ex: Bus — outbound")} onChange={(event) => updateRule(rule.id, "description", event.target.value)} />
                        {errors[`rule_${rule.id}_description`] && <small className="field-error">{errors[`rule_${rule.id}_description`]}</small>}
                      </label>
                      <label className={errors[`rule_${rule.id}_amount`] ? "has-error" : ""}>
                        <span>{copy("Valor", "Amount")}</span>
                        <div className="batch-money-input">
                          <b>R$</b>
                          <input inputMode="decimal" value={rule.amount.replace(/^R\$\s?/, "")} placeholder="0,00" onChange={(event) => updateRule(rule.id, "amount", formatTypedMoneyForEditing(event.target.value))} onBlur={() => updateRule(rule.id, "amount", formatTypedMoneyAsCurrency(rule.amount))} />
                        </div>
                        {errors[`rule_${rule.id}_amount`] && <small className="field-error">{errors[`rule_${rule.id}_amount`]}</small>}
                      </label>
                    </div>
                    <fieldset className={errors[`rule_${rule.id}_weekdays`] ? "has-error" : ""}>
                      <legend>{copy("Repete em", "Repeats on")}</legend>
                      <div className="batch-weekdays">
                        {WEEKDAYS.map((weekday) => (
                          <button type="button" className={rule.weekdays.includes(weekday.value) ? "selected" : ""} aria-pressed={rule.weekdays.includes(weekday.value)} onClick={() => toggleWeekday(rule, weekday.value)} key={weekday.value}>
                            {english ? weekday.en : weekday.pt}
                          </button>
                        ))}
                      </div>
                      {errors[`rule_${rule.id}_weekdays`] && <small className="field-error">{errors[`rule_${rule.id}_weekdays`]}</small>}
                    </fieldset>
                  </article>
                ))}
              </div>
              <button className="batch-add-rule" type="button" onClick={addRule} disabled={form.rules.length >= 20}><Plus size={16} /> {copy("Adicionar outra regra", "Add another rule")}</button>
            </section>
          </main>

          <aside className="batch-preview">
            <div className="batch-preview-title"><CalendarRange size={18} /><div><strong>{copy("Prévia do lote", "Batch preview")}</strong><small>{copy("Revise antes de adicionar", "Review before adding")}</small></div></div>
            <div className="batch-preview-metrics">
              <div><span>{copy("LANÇAMENTOS", "ENTRIES")}</span><strong>{entries.length}</strong></div>
              <div><span>{copy("TOTAL", "TOTAL")}</span><strong className={form.type === "expense" ? "expense" : "income"}>{formatMoney(total)}</strong></div>
            </div>
            <div className="batch-preview-list">
              {visibleEntries.length ? visibleEntries.map((entry, index) => (
                <div key={`${entry.date}-${index}`}>
                  <time>{formatDateShort(entry.date)}</time>
                  <span>{entry.description || copy("Sem descrição", "No description")}</span>
                  <strong>{formatMoney(entry.amount)}</strong>
                </div>
              )) : <p>{copy("Preencha as regras para visualizar os lançamentos.", "Fill in the rules to preview the entries.")}</p>}
            </div>
            {entries.length > visibleEntries.length && <small className="batch-preview-more">+ {entries.length - visibleEntries.length} {copy("outros lançamentos", "more entries")}</small>}
            <p className="batch-atomic-note">{copy("Tudo será salvo de uma vez. Se algo falhar, nenhum lançamento será criado.", "Everything is saved at once. If anything fails, no entry will be created.")}</p>
          </aside>
        </div>

        {errors.batch && <div className="batch-error"><span className="field-error">{errors.batch}</span></div>}
        <footer className="batch-modal-actions">
          <button className="btn" type="button" onClick={onClose}>{copy("Cancelar", "Cancel")}</button>
          <button className={`btn btn-primary ${form.type === "income" ? "income" : ""}`} type="submit" disabled={saving || !entries.length}>
            {saving
              ? <><Loader2 className="spin" size={16} /> {copy("Adicionando...", "Adding...")}</>
              : <><Layers3 size={16} /> {entries.length ? copy(`Adicionar ${entries.length} lançamentos`, `Add ${entries.length} entries`) : copy("Adicionar lançamentos", "Add entries")}</>}
          </button>
        </footer>
      </form>
    </div>
  );
}
