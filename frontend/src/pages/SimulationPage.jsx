import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleDollarSign, LineChart as LineChartIcon, Plus, Trash2, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-hot-toast";
import { createInstallment, createTransaction, getMonth, getMonthSummary } from "../api/api.js";
import { MonthField } from "../components/DateField.jsx";
import { addMonthsToDate, invoiceAcceptsNewCharges, todayIsoDate } from "../app/helpers.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatMonthLabel, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

const MAX_ITEMS = 10;

function makeItemId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function blankItem() {
  return {
    id: makeItemId(),
    description: "",
    type: "expense",
    mode: "cash",
    totalAmount: "",
    installmentCount: 2,
    month: currentMonthValue()
  };
}

function monthIndex(monthValue) {
  const [year, month] = String(monthValue || currentMonthValue()).split("-").map(Number);
  return year * 12 + month - 1;
}

function monthFromIndex(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, value: `${year}-${String(month).padStart(2, "0")}` };
}

function monthStartDate(monthValue) {
  return `${monthValue}-01`;
}

function splitAmount(total, count) {
  const cents = Math.round(Number(total || 0) * 100);
  const safeCount = Math.max(1, Number(count) || 1);
  const base = Math.floor(cents / safeCount);
  return Array.from({ length: safeCount }, (_, index) => (
    index === safeCount - 1 ? (cents - (base * (safeCount - 1))) / 100 : base / 100
  ));
}

function normalizeRestoredItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((item) => ({
    ...blankItem(),
    ...item,
    id: item.id || makeItemId(),
    type: item.type === "income" ? "income" : "expense",
    mode: item.mode === "installment" ? "installment" : "cash",
    month: /^\d{4}-\d{2}$/.test(item.month || "") ? item.month : currentMonthValue()
  }));
}

function moneyAxisWidth(values, language) {
  const longest = values.reduce((max, value) => Math.max(max, formatMoney(value, language).length), 0);
  return Math.min(Math.max(longest * 8 + 28, 104), 168);
}

function getItemAmount(item, language) {
  return parseTypedMoneyInput(item.totalAmount, language);
}

function buildSimulatedImpacts(items, language) {
  const impacts = new Map();

  items.forEach((item) => {
    const amount = getItemAmount(item, language);
    if (!amount || !item.month) return;
    const description = item.description?.trim() || "Item simulado";
    const values = item.mode === "installment" ? splitAmount(amount, item.installmentCount) : [amount];

    values.forEach((value, index) => {
      const target = monthFromIndex(monthIndex(item.month) + index).value;
      const entry = impacts.get(target) || { expense: 0, income: 0, items: [] };
      if (item.type === "income") entry.income += value;
      else entry.expense += value;
      entry.items.push({
        id: `${item.id}-${index}`,
        description,
        type: item.type,
        amount: value,
        installmentLabel: item.mode === "installment" ? `${index + 1}/${values.length}` : null
      });
      impacts.set(target, entry);
    });
  });

  return impacts;
}

function simulationEndIndex(items, language) {
  const start = monthIndex(currentMonthValue());
  const lastAffected = items.reduce((last, item) => {
    const amount = getItemAmount(item, language);
    if (!amount) return last;
    const offset = item.mode === "installment" ? Math.max(1, Number(item.installmentCount) || 1) - 1 : 0;
    return Math.max(last, monthIndex(item.month) + offset);
  }, start);
  return Math.max(lastAffected + 1, start + 1);
}

function realTotalsForMonth(monthData, isCurrentMonth) {
  if (!monthData) return { income: 0, expense: 0 };
  const today = todayIsoDate();
  return (monthData.days || []).reduce((totals, day) => {
    if (isCurrentMonth && day.date <= today) return totals;
    return {
      income: totals.income + Number(day.income || 0),
      expense: totals.expense + Number(day.expenses || 0)
    };
  }, { income: 0, expense: 0 });
}

function projectionRows({ baseBalance, includeReal, months, realByMonth, simulatedByMonth, language }) {
  let withoutSimulation = Number(baseBalance || 0);
  let withSimulation = Number(baseBalance || 0);

  return months.map((month, index) => {
    const real = includeReal ? (realByMonth.get(month.value) || { income: 0, expense: 0 }) : { income: 0, expense: 0 };
    const simulated = simulatedByMonth.get(month.value) || { income: 0, expense: 0, items: [] };
    const initial = withSimulation;
    withoutSimulation = withoutSimulation + real.income - real.expense;
    withSimulation = withSimulation + real.income - real.expense + simulated.income - simulated.expense;

    return {
      ...month,
      label: formatMonthLabel(month.year, month.month, language),
      shortLabel: formatMonthLabel(month.year, month.month, language).slice(0, 3),
      initial,
      realIncome: real.income,
      realExpense: real.expense,
      simulatedIncome: simulated.income,
      simulatedExpense: simulated.expense,
      simulatedItems: simulated.items,
      withoutSimulation,
      withSimulation,
      difference: withSimulation - withoutSimulation,
      isCurrent: index === 0
    };
  });
}

function ProjectionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="simulation-tooltip">
      <strong>{label}</strong>
      <span>Sem simulação: {formatMoney(row.withoutSimulation)}</span>
      <span>Com simulação: {formatMoney(row.withSimulation)}</span>
      <span className={row.difference < 0 ? "money-expense" : "money-income"}>Diferença: {formatMoney(row.difference)}</span>
    </div>
  );
}

function SimulatedItemCard({ item, index, onChange, onRemove, language }) {
  const total = getItemAmount(item, language);
  const count = Math.max(1, Number(item.installmentCount) || 1);
  const installments = splitAmount(total, count);
  const perInstallment = installments[0] || 0;

  const setMoney = (value) => onChange({ totalAmount: formatTypedMoneyForEditing(value, language) });
  const normalizeMoney = () => onChange({ totalAmount: formatTypedMoneyAsCurrency(item.totalAmount, language) });

  return (
    <article className="simulation-item-card">
      <header>
        <strong>Item {index + 1}</strong>
        <button className="icon-btn small danger" type="button" onClick={onRemove} aria-label="Remover item simulado">
          <X size={15} />
        </button>
      </header>

      <label>
        <span>Descrição</span>
        <input value={item.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Ex: TV Samsung 55&quot;" />
      </label>

      <div className="simulation-toggle-grid">
        <div className="segmented-control" aria-label="Tipo do item">
          <button type="button" className={item.type === "expense" ? "active danger" : ""} onClick={() => onChange({ type: "expense" })}>Gasto</button>
          <button type="button" className={item.type === "income" ? "active success" : ""} onClick={() => onChange({ type: "income" })}>Receita</button>
        </div>
        <div className="segmented-control" aria-label="Modalidade">
          <button type="button" className={item.mode === "cash" ? "active" : ""} onClick={() => onChange({ mode: "cash" })}>À vista</button>
          <button type="button" className={item.mode === "installment" ? "active" : ""} onClick={() => onChange({ mode: "installment" })}>Parcelado</button>
        </div>
      </div>

      <div className={item.mode === "installment" ? "simulation-form-grid three" : "simulation-form-grid"}>
        <label>
          <span>Valor total</span>
          <input inputMode="decimal" value={item.totalAmount} onChange={(event) => setMoney(event.target.value)} onBlur={normalizeMoney} placeholder="R$ 0,00" />
        </label>
        {item.mode === "installment" && (
          <>
            <label>
              <span>Parcelas</span>
              <input type="number" min="1" max="48" value={item.installmentCount} onChange={(event) => onChange({ installmentCount: event.target.value })} onBlur={() => onChange({ installmentCount: count })} />
            </label>
            <label>
              <span>Valor por parcela</span>
              <input value={formatMoney(perInstallment, language)} readOnly />
            </label>
          </>
        )}
        <label>
          <span>{item.mode === "installment" ? "Primeira parcela" : "Data prevista"}</span>
          <MonthField value={item.month} onChange={(value) => onChange({ month: value })} />
        </label>
      </div>
    </article>
  );
}

function ConfirmationModal({ items, invoices, onClose, onConfirm, language }) {
  const validItems = items.filter((item) => getItemAmount(item, language) > 0);

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} />
      <div className="modal-card simulation-confirm-modal">
        <div className="modal-titlebar">
          <div>
            <p className="eyebrow">Efetivar simulação</p>
            <h2>Inserir itens no sistema</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="simulation-confirm-list">
          {validItems.map((item) => {
            const firstInvoice = findInvoiceForMonth(invoices, item.month);
            return (
              <div className="simulation-confirm-row" key={item.id}>
                <span className={`type-chip ${item.type}`}>{item.type === "income" ? "Receita" : "Gasto"}</span>
                <strong>{item.description?.trim() || "Item simulado"}</strong>
                <span>{item.mode === "installment" ? `${item.installmentCount}x` : "À vista"} em {formatMonthLabel(...item.month.split("-").map(Number), language)}</span>
                <span>{formatMoney(getItemAmount(item, language), language)}</span>
                {item.mode === "installment" && item.type === "expense" && !firstInvoice && (
                  <small className="danger-text">Sem fatura elegível no mês inicial.</small>
                )}
                {item.mode === "installment" && item.type === "income" && (
                  <small>Será inserido como lançamentos mensais de receita.</small>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" onClick={onConfirm}>Confirmar inserção</button>
        </div>
      </div>
    </div>
  );
}

function findInvoiceForMonth(invoices, monthValue) {
  return invoices
    .filter(invoiceAcceptsNewCharges)
    .find((invoice) => String(invoice.due_date || "").slice(0, 7) === monthValue);
}

export default function SimulationPage({ invoices = [], onInserted }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const storageKey = `kashy365_simulation_${user?.id || "local"}`;
  const [items, setItems] = useState([]);
  const [activeItems, setActiveItems] = useState([]);
  const [includeReal, setIncludeReal] = useState(true);
  const [baseSummary, setBaseSummary] = useState(null);
  const [realMonths, setRealMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restored, setRestored] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setStorageReady(false);
    try {
      const restoredItems = normalizeRestoredItems(JSON.parse(localStorage.getItem(storageKey) || "[]"));
      if (restoredItems.length) {
        setItems(restoredItems);
        setActiveItems(restoredItems);
        setRestored(true);
      } else {
        setItems([]);
        setActiveItems([]);
        setRestored(false);
      }
    } catch {
      setItems([]);
      setActiveItems([]);
      setRestored(false);
    } finally {
      setStorageReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }, [items, storageKey, storageReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => setActiveItems(items), 500);
    return () => window.clearTimeout(timer);
  }, [items]);

  const endIndex = useMemo(() => simulationEndIndex(activeItems, language), [activeItems, language]);
  const months = useMemo(() => {
    const start = monthIndex(currentMonthValue());
    return Array.from({ length: endIndex - start + 1 }, (_, offset) => monthFromIndex(start + offset));
  }, [endIndex]);

  useEffect(() => {
    let mounted = true;
    async function loadProjectionBase() {
      setLoading(true);
      try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const [summaryPayload, ...monthPayloads] = await Promise.all([
          getMonthSummary(currentYear, currentMonth),
          ...months.map((item) => getMonth(item.year, item.month))
        ]);
        if (!mounted) return;
        setBaseSummary(summaryPayload);
        setRealMonths(monthPayloads);
      } catch {
        toast.error("Erro ao carregar dados do simulador");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadProjectionBase();
    return () => { mounted = false; };
  }, [months]);

  const simulatedByMonth = useMemo(() => buildSimulatedImpacts(activeItems, language), [activeItems, language]);
  const realByMonth = useMemo(() => {
    const current = currentMonthValue();
    return new Map(realMonths.map((monthData) => {
      const key = `${monthData.year}-${String(monthData.month).padStart(2, "0")}`;
      return [key, realTotalsForMonth(monthData, key === current)];
    }));
  }, [realMonths]);

  const rows = useMemo(() => projectionRows({
    baseBalance: baseSummary?.current_balance,
    includeReal,
    months,
    realByMonth,
    simulatedByMonth,
    language
  }), [baseSummary, includeReal, language, months, realByMonth, simulatedByMonth]);

  const validItems = useMemo(() => activeItems.filter((item) => getItemAmount(item, language) > 0), [activeItems, language]);
  const baseBalance = Number(baseSummary?.current_balance || 0);
  const finalRow = rows[rows.length - 1];
  const projectedBalance = finalRow?.withSimulation ?? baseBalance;
  const baselineFinal = finalRow?.withoutSimulation ?? baseBalance;
  const simulatedImpact = projectedBalance - baselineFinal;
  const worstRow = rows.reduce((worst, row) => (!worst || row.withSimulation < worst.withSimulation ? row : worst), null);
  const negativeRow = rows.find((row) => row.withSimulation < 0);
  const axisWidth = moneyAxisWidth(rows.flatMap((row) => [row.withoutSimulation, row.withSimulation]), language);
  const minBalance = Math.min(0, ...rows.flatMap((row) => [row.withoutSimulation, row.withSimulation]));

  const updateItem = (id, patch) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const removeItem = (id) => setItems((current) => current.filter((item) => item.id !== id));
  const addItem = () => setItems((current) => current.length >= MAX_ITEMS ? current : [...current, blankItem()]);
  const clearItems = () => {
    if (!items.length || !window.confirm("Deseja limpar a simulação?")) return;
    setItems([]);
    setActiveItems([]);
    setRestored(false);
  };
  const discardRestored = () => {
    setItems([]);
    setActiveItems([]);
    setRestored(false);
  };
  const simulateNow = () => setActiveItems(items);
  const toggleRow = (value) => setExpandedRows((current) => ({ ...current, [value]: !current[value] }));

  const insertItem = async (item) => {
    const amount = getItemAmount(item, language);
    const description = item.description?.trim() || "Item simulado";
    if (!amount) return 0;

    if (item.mode === "cash") {
      await createTransaction({
        date: monthStartDate(item.month),
        type: item.type,
        amount,
        description,
        is_future: monthStartDate(item.month) > todayIsoDate()
      });
      return 1;
    }

    const values = splitAmount(amount, item.installmentCount);
    if (item.type === "income") {
      await Promise.all(values.map((value, index) => createTransaction({
        date: monthStartDate(monthFromIndex(monthIndex(item.month) + index).value),
        type: "income",
        amount: value,
        description: `${description} (${index + 1}/${values.length})`,
        is_future: monthStartDate(monthFromIndex(monthIndex(item.month) + index).value) > todayIsoDate()
      })));
      return 1;
    }

    const firstInvoice = findInvoiceForMonth(invoices, item.month);
    if (!firstInvoice) throw new Error(`Crie uma fatura elegível em ${formatMonthLabel(...item.month.split("-").map(Number), language)} antes de inserir "${description}".`);

    await createInstallment({
      description,
      total_amount: amount,
      installment_count: values.length,
      first_invoice_id: Number(firstInvoice.id),
      items: values.map((value, index) => ({
        invoice_id: index === 0 ? Number(firstInvoice.id) : null,
        amount: value,
        target_due_date: addMonthsToDate(firstInvoice.due_date, index)
      }))
    });
    return 1;
  };

  const confirmInsert = async () => {
    try {
      let inserted = 0;
      for (const item of validItems) {
        inserted += await insertItem(item);
      }
      toast.success(`${inserted} ${inserted === 1 ? "item inserido" : "itens inseridos"} no sistema!`);
      setConfirmOpen(false);
      setItems([]);
      setActiveItems([]);
      setRestored(false);
      await onInserted?.();
    } catch (error) {
      toast.error(error.message || "Erro ao inserir itens no sistema");
    }
  };

  return (
    <section className="simulation-page">
      <div className="simulation-layout">
        <aside className="simulation-panel card">
          <div className="simulation-panel-head">
            <div>
              <p className="eyebrow">Simulador financeiro</p>
              <h2>Teste compras e receitas sem afetar seus dados reais.</h2>
            </div>
            <LineChartIcon size={22} />
          </div>

          <div className="simulation-balance-box">
            <span>Saldo atual</span>
            <strong>{loading ? "Carregando..." : formatMoney(baseBalance, language)}</strong>
          </div>

          <label className={`switch-row simulation-switch ${includeReal ? "active" : ""}`}>
            <input type="checkbox" checked={includeReal} onChange={(event) => setIncludeReal(event.target.checked)} />
            <span><i /> Incluir lançamentos já cadastrados</span>
          </label>

          {restored && (
            <div className="simulation-restored">
              <span>Simulação restaurada da última sessão.</span>
              <button type="button" onClick={discardRestored}>Descartar</button>
            </div>
          )}

          <div className="simulation-items">
            {items.map((item, index) => (
              <SimulatedItemCard
                key={item.id}
                item={item}
                index={index}
                language={language}
                onChange={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
            {!items.length && (
              <div className="simulation-empty">
                <CircleDollarSign size={26} />
                <strong>Nenhum item simulado.</strong>
                <span>Adicione uma compra ou receita para ver o impacto mês a mês.</span>
              </div>
            )}
          </div>

          <div className="simulation-actions">
            <button className="btn btn-ghost" type="button" onClick={addItem} disabled={items.length >= MAX_ITEMS}>
              <Plus size={16} /> Adicionar item simulado
            </button>
            <button className="btn btn-ghost danger-soft" type="button" onClick={clearItems} disabled={!items.length}>
              <Trash2 size={16} /> Limpar tudo
            </button>
            <button className="btn btn-primary simulation-submit" type="button" onClick={simulateNow}>
              Simular <ChevronRight size={16} />
            </button>
          </div>
        </aside>

        <div className="simulation-results">
          <section className="card simulation-summary-card">
            <div className="simulation-summary-row">
              <span>Saldo atual</span>
              <strong>{formatMoney(baseBalance, language)}</strong>
            </div>
            <div className="simulation-summary-row">
              <span>Impacto simulado</span>
              <strong className={simulatedImpact < 0 ? "money-expense" : "money-income"}>{formatMoney(simulatedImpact, language)}</strong>
            </div>
            <hr />
            <div className="simulation-summary-row projected">
              <span>Saldo projetado</span>
              <strong>{formatMoney(projectedBalance, language)}</strong>
            </div>
            <div className="simulation-summary-row">
              <span>Pior mês</span>
              <strong>{worstRow?.label || "-"}</strong>
            </div>
            <div className="simulation-summary-row">
              <span>Menor saldo</span>
              <strong className={Number(worstRow?.withSimulation || 0) < 0 ? "money-expense" : ""}>{formatMoney(worstRow?.withSimulation || 0, language)}</strong>
            </div>
            {negativeRow && (
              <div className="simulation-alert">
                <AlertTriangle size={18} />
                <span>Saldo negativo em {negativeRow.label} ({formatMoney(negativeRow.withSimulation, language)}). Considere reduzir parcelas ou adiar a compra.</span>
              </div>
            )}
          </section>

          <section className="card simulation-chart-card">
            <h2>Projeção de saldo</h2>
            <div className="simulation-chart-scroll">
              <div className="simulation-chart-inner">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                    {minBalance < 0 && <ReferenceArea y1={minBalance} y2={0} fill="#FF4D6A" fillOpacity={0.10} />}
                    <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} />
                    <YAxis width={axisWidth} tickFormatter={(value) => formatMoney(value, language)} tickLine={false} axisLine={false} tickMargin={8} />
                    <Tooltip content={<ProjectionTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="withoutSimulation" name="Sem simulação" stroke="#94A3B8" strokeWidth={2} strokeDasharray="6 6" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="withSimulation" name="Com simulação" stroke="#14A078" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="card simulation-table-card">
            <h2>Tabela mensal da projeção</h2>
            <div className="simulation-table-wrap">
              <div className="simulation-table">
                <div className="simulation-table-row simulation-table-head">
                  <span>Mês</span>
                  <span>Saldo inicial</span>
                  <span>Gastos sim.</span>
                  <span>Ganhos sim.</span>
                  <span>Saldo final</span>
                </div>
                {rows.map((row) => {
                  const expanded = expandedRows[row.value];
                  return (
                    <div className={`simulation-month-group ${row.isCurrent ? "current" : ""} ${row.withSimulation < 0 ? "negative" : ""}`} key={row.value}>
                      <button className="simulation-table-row simulation-table-button" type="button" onClick={() => toggleRow(row.value)}>
                        <span>{row.simulatedItems.length ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="simulation-row-spacer" />} {row.label}</span>
                        <span>{formatMoney(row.initial, language)}</span>
                        <span>{formatMoney(row.simulatedExpense, language)}</span>
                        <span>{formatMoney(row.simulatedIncome, language)}</span>
                        <strong>{formatMoney(row.withSimulation, language)}</strong>
                      </button>
                      {expanded && row.simulatedItems.length > 0 && (
                        <div className="simulation-expanded">
                          {row.simulatedItems.map((entry) => (
                            <div key={entry.id}>
                              <span>{entry.type === "income" ? "Receita" : "Gasto"}</span>
                              <strong>{entry.description}{entry.installmentLabel ? ` - parcela ${entry.installmentLabel}` : ""}</strong>
                              <em className={entry.type === "income" ? "money-income" : "money-expense"}>{entry.type === "income" ? "+" : "-"}{formatMoney(entry.amount, language)}</em>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {validItems.length > 0 && (
            <div className="simulation-insert-footer">
              <button className="btn btn-ghost insert-simulation-btn" type="button" onClick={() => setConfirmOpen(true)}>
                <Check size={16} /> Inserir itens no sistema
              </button>
            </div>
          )}
        </div>
      </div>

      <button className="simulation-mobile-fab" type="button" onClick={simulateNow}>Simular <ChevronRight size={16} /></button>

      {confirmOpen && (
        <ConfirmationModal
          items={validItems}
          invoices={invoices}
          language={language}
          onClose={() => setConfirmOpen(false)}
          onConfirm={confirmInsert}
        />
      )}
    </section>
  );
}
