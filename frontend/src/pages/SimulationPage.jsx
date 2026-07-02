import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleDollarSign, LineChart as LineChartIcon, Plus, Trash2, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "react-hot-toast";
import { createInstallment, createTransaction, getMonthSummary } from "../api/api.js";
import { MonthField } from "../components/DateField.jsx";
import { addMonthsToDate, invoiceAcceptsNewCharges, todayIsoDate } from "../app/helpers.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatMonthLabel, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

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
    recurrenceCount: 6,
    valueMode: "equal",
    values: [],
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
  return items.map((item) => {
    const type = item.type === "income" ? "income" : "expense";
    let mode = item.mode === "recurring" || item.mode === "installment" ? item.mode : "cash";
    if (type === "income" && mode === "installment") mode = "recurring";
    if (type === "expense" && mode === "recurring") mode = "cash";
    return {
      ...blankItem(),
      ...item,
      id: item.id || makeItemId(),
      type,
      mode,
      installmentCount: Math.max(1, Number(item.installmentCount) || 2),
      recurrenceCount: Math.max(1, Number(item.recurrenceCount) || 6),
      valueMode: item.valueMode === "different" ? "different" : "equal",
      values: Array.isArray(item.values) ? item.values : [],
      month: /^\d{4}-\d{2}$/.test(item.month || "") ? item.month : currentMonthValue()
    };
  });
}

function moneyAxisWidth(values, language) {
  const longest = values.reduce((max, value) => Math.max(max, formatMoney(value, language).length), 0);
  return Math.min(Math.max(longest * 8 + 28, 104), 168);
}

function getItemAmount(item, language) {
  return parseTypedMoneyInput(item.totalAmount, language);
}

function getItemCount(item) {
  if (item.mode === "installment") return Math.max(1, Number(item.installmentCount) || 1);
  if (item.mode === "recurring") return Math.max(1, Number(item.recurrenceCount) || 1);
  return 1;
}

function getEqualValues(item, language) {
  const amount = getItemAmount(item, language);
  const count = getItemCount(item);
  if (item.mode === "installment") return splitAmount(amount, count);
  if (item.mode === "recurring") return Array.from({ length: count }, () => amount);
  return [amount];
}

function getItemValues(item, language) {
  const equalValues = getEqualValues(item, language);
  if (item.mode === "cash" || item.valueMode !== "different") return equalValues;
  return Array.from({ length: getItemCount(item) }, (_, index) => {
    const rawValue = item.values?.[index];
    if (rawValue !== undefined && String(rawValue).trim() !== "") return parseTypedMoneyInput(rawValue, language);
    return equalValues[index] || 0;
  });
}

function getItemTotal(item, language) {
  return getItemValues(item, language).reduce((sum, value) => sum + Number(value || 0), 0);
}

function buildSimulatedImpacts(items, language) {
  const impacts = new Map();

  items.forEach((item) => {
    const values = getItemValues(item, language);
    if (!getItemTotal(item, language) || !item.month) return;
    const description = item.description?.trim() || "Item simulado";

    values.forEach((value, index) => {
      if (!value) return;
      const target = monthFromIndex(monthIndex(item.month) + index).value;
      const entry = impacts.get(target) || { expense: 0, income: 0, items: [] };
      if (item.type === "income") entry.income += value;
      else entry.expense += value;
      entry.items.push({
        id: `${item.id}-${index}`,
        description,
        type: item.type,
        amount: value,
        installmentLabel: item.mode !== "cash" ? `${index + 1}/${values.length}` : null,
        periodType: item.mode === "recurring" ? "mês" : "parcela"
      });
      impacts.set(target, entry);
    });
  });

  return impacts;
}

function simulationEndIndex(items, language) {
  const start = monthIndex(currentMonthValue());
  const lastAffected = items.reduce((last, item) => {
    if (!getItemTotal(item, language)) return last;
    const offset = getItemCount(item) - 1;
    return Math.max(last, monthIndex(item.month) + offset);
  }, start);
  return Math.max(lastAffected + 1, start + 1);
}

function projectionRows({ baseBalance, includeReal, months, summaryByMonth, simulatedByMonth, language }) {
  const startingBalance = Number(baseBalance || 0);
  let simulatedCarry = 0;

  return months.map((month, index) => {
    const summary = summaryByMonth.get(month.value);
    const realProjectedClosing = includeReal ? Number(summary?.projected_closing ?? startingBalance) : startingBalance;
    const simulated = simulatedByMonth.get(month.value) || { income: 0, expense: 0, items: [] };
    const initial = realProjectedClosing + simulatedCarry;
    simulatedCarry += simulated.income - simulated.expense;
    const withoutSimulation = realProjectedClosing;
    const withSimulation = realProjectedClosing + simulatedCarry;

    return {
      ...month,
      label: formatMonthLabel(month.year, month.month, language),
      shortLabel: formatMonthLabel(month.year, month.month, language).slice(0, 3),
      initial,
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
  const [collapsed, setCollapsed] = useState(false);
  const count = Math.max(1, Number(item.installmentCount) || 1);
  const recurrenceCount = Math.max(1, Number(item.recurrenceCount) || 1);
  const itemCount = getItemCount(item);
  const equalValues = getEqualValues(item, language);
  const values = getItemValues(item, language);
  const variableValuesEnabled = item.mode !== "cash" && item.valueMode === "different";
  const totalSimulated = getItemTotal(item, language);
  const repeatedLabel = item.mode === "installment" ? "Parcelas" : "Meses";
  const repeatedValueLabel = item.mode === "installment" ? "Valor por parcela" : "Valor por mês";

  const setMoney = (value) => onChange({ totalAmount: formatTypedMoneyForEditing(value, language) });
  const normalizeMoney = () => onChange({ totalAmount: formatTypedMoneyAsCurrency(item.totalAmount, language) });
  const normalizeCount = (field, value) => onChange({ [field]: Math.max(1, Number(value) || 1) });
  const setType = (type) => onChange({
    type,
    mode: type === "income" && item.mode === "installment" ? "cash" : type === "expense" && item.mode === "recurring" ? "cash" : item.mode
  });
  const setValueMode = (different) => onChange({
    valueMode: different ? "different" : "equal",
    values: different ? equalValues.map((value, valueIndex) => item.values?.[valueIndex] || formatMoney(value, language)) : []
  });
  const setCustomValue = (valueIndex, value) => {
    const nextValues = Array.from({ length: itemCount }, (_, currentIndex) => item.values?.[currentIndex] || formatMoney(equalValues[currentIndex] || 0, language));
    nextValues[valueIndex] = formatTypedMoneyForEditing(value, language);
    onChange({ values: nextValues });
  };
  const normalizeCustomValue = (valueIndex) => {
    const nextValues = Array.from({ length: itemCount }, (_, currentIndex) => item.values?.[currentIndex] || formatMoney(equalValues[currentIndex] || 0, language));
    nextValues[valueIndex] = formatMoney(parseTypedMoneyInput(nextValues[valueIndex], language), language);
    onChange({ values: nextValues });
  };
  const typeLabel = item.type === "income" ? "Receita" : "Gasto";
  const modeLabel = item.mode === "installment" ? `${itemCount}x` : item.mode === "recurring" ? `${itemCount} meses` : "À vista";
  const itemTitle = item.description?.trim() || `Item ${index + 1}`;

  return (
    <article className={`simulation-item-card ${collapsed ? "collapsed" : ""}`}>
      <header>
        <button className="simulation-item-collapse" type="button" onClick={() => setCollapsed((current) => !current)} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <span>
            <strong>{itemTitle}</strong>
            {collapsed && <small>{typeLabel} • {modeLabel} • {formatMoney(totalSimulated, language)}</small>}
          </span>
        </button>
        <div className="simulation-item-actions">
          <button className="icon-btn small" type="button" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Expandir detalhes do item" : "Recolher detalhes do item"}>
            {collapsed ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <button className="icon-btn small danger" type="button" onClick={onRemove} aria-label="Remover item simulado">
            <X size={15} />
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <label>
            <span>Descrição</span>
            <input value={item.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Ex: TV Samsung 55&quot;" />
          </label>

          <div className="simulation-toggle-grid">
            <div className="segmented-control" aria-label="Tipo do item">
              <button type="button" className={item.type === "expense" ? "active danger" : ""} onClick={() => setType("expense")}>Gasto</button>
              <button type="button" className={item.type === "income" ? "active success" : ""} onClick={() => setType("income")}>Receita</button>
            </div>
            <div className="segmented-control" aria-label="Modalidade">
              <button type="button" className={item.mode === "cash" ? "active" : ""} onClick={() => onChange({ mode: "cash" })}>À vista</button>
              {item.type === "income" ? (
                <button type="button" className={item.mode === "recurring" ? "active success" : ""} onClick={() => onChange({ mode: "recurring" })}>Recorrente</button>
              ) : (
                <button type="button" className={item.mode === "installment" ? "active" : ""} onClick={() => onChange({ mode: "installment" })}>Parcelado</button>
              )}
            </div>
          </div>

          <div className={item.mode !== "cash" ? "simulation-form-grid three" : "simulation-form-grid"}>
            <label>
              <span>{item.mode === "recurring" ? "Valor mensal" : "Valor total"}</span>
              <input inputMode="decimal" value={item.totalAmount} onChange={(event) => setMoney(event.target.value)} onBlur={normalizeMoney} placeholder="R$ 0,00" />
            </label>
            {item.mode !== "cash" && (
              <>
                <label>
                  <span>{repeatedLabel}</span>
                  {item.mode === "installment" ? (
                    <input type="number" min="1" max="48" value={item.installmentCount} onChange={(event) => onChange({ installmentCount: event.target.value })} onBlur={() => normalizeCount("installmentCount", count)} />
                  ) : (
                    <input type="number" min="1" value={item.recurrenceCount} onChange={(event) => onChange({ recurrenceCount: event.target.value })} onBlur={() => normalizeCount("recurrenceCount", recurrenceCount)} />
                  )}
                </label>
                <label>
                  <span>{variableValuesEnabled ? "Total simulado" : repeatedValueLabel}</span>
                  <input value={formatMoney(variableValuesEnabled ? totalSimulated : values[0] || 0, language)} readOnly />
                </label>
              </>
            )}
            <label>
              <span>{item.mode === "installment" ? "Primeira parcela" : item.mode === "recurring" ? "Primeira receita" : "Data prevista"}</span>
              <MonthField value={item.month} onChange={(value) => onChange({ month: value })} />
            </label>
          </div>

          {item.mode !== "cash" && (
            <label className={`switch-row simulation-switch ${variableValuesEnabled ? "active" : ""}`}>
              <input type="checkbox" checked={variableValuesEnabled} onChange={(event) => setValueMode(event.target.checked)} />
              <span><i /> Valores diferentes {item.mode === "installment" ? "entre parcelas" : "entre meses"}</span>
            </label>
          )}

          {variableValuesEnabled && (
            <div className="simulation-values-grid">
              {Array.from({ length: itemCount }, (_, valueIndex) => {
                const month = monthFromIndex(monthIndex(item.month) + valueIndex);
                const valueText = item.values?.[valueIndex] || formatMoney(equalValues[valueIndex] || 0, language);
                return (
                  <label key={`${item.id}-value-${valueIndex}`}>
                    <span>{item.mode === "installment" ? `Parcela ${valueIndex + 1}` : `Mês ${valueIndex + 1}`} - {formatMonthLabel(month.year, month.month, language)}</span>
                    <input inputMode="decimal" value={valueText} onChange={(event) => setCustomValue(valueIndex, event.target.value)} onBlur={() => normalizeCustomValue(valueIndex)} />
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function ConfirmationModal({ items, invoices, onClose, onConfirm, language }) {
  const validItems = items.filter((item) => getItemTotal(item, language) > 0);

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
            const modeLabel = item.mode === "installment" ? `${getItemCount(item)}x` : item.mode === "recurring" ? `${getItemCount(item)} meses` : "À vista";
            return (
              <div className="simulation-confirm-row" key={item.id}>
                <span className={`type-chip ${item.type}`}>{item.type === "income" ? "Receita" : "Gasto"}</span>
                <strong>{item.description?.trim() || "Item simulado"}</strong>
                <span>{modeLabel} em {formatMonthLabel(...item.month.split("-").map(Number), language)}</span>
                <span>{formatMoney(getItemTotal(item, language), language)}</span>
                {item.mode === "installment" && item.type === "expense" && !firstInvoice && (
                  <small className="danger-text">Sem fatura elegível no mês inicial.</small>
                )}
                {item.mode === "recurring" && item.type === "income" && (
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

export default function SimulationPage({ invoices = [], monthCards = [], onInserted }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const storageKey = `kashy365_simulation_${user?.id || "local"}`;
  const [items, setItems] = useState([]);
  const [activeItems, setActiveItems] = useState([]);
  const [includeReal, setIncludeReal] = useState(true);
  const [baseSummary, setBaseSummary] = useState(null);
  const [monthSummaries, setMonthSummaries] = useState([]);
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

  const registeredEndIndex = useMemo(() => {
    const current = monthIndex(currentMonthValue());
    return monthCards.reduce((last, item) => Math.max(last, monthIndex(`${item.year}-${String(item.month).padStart(2, "0")}`)), current);
  }, [monthCards]);
  const endIndex = useMemo(() => Math.max(simulationEndIndex(activeItems, language), registeredEndIndex), [activeItems, language, registeredEndIndex]);
  const months = useMemo(() => {
    const start = monthIndex(currentMonthValue());
    return Array.from({ length: endIndex - start + 1 }, (_, offset) => monthFromIndex(start + offset));
  }, [endIndex]);

  useEffect(() => {
    let mounted = true;
    async function loadProjectionBase() {
      setLoading(true);
      try {
        const summaryPayloads = await Promise.all(months.map((item) => getMonthSummary(item.year, item.month)));
        if (!mounted) return;
        setBaseSummary(summaryPayloads[0] || null);
        setMonthSummaries(summaryPayloads);
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
  const summaryByMonth = useMemo(() => new Map(monthSummaries.map((summary) => [
    `${summary.year}-${String(summary.month).padStart(2, "0")}`,
    summary
  ])), [monthSummaries]);

  const rows = useMemo(() => projectionRows({
    baseBalance: baseSummary?.current_balance,
    includeReal,
    months,
    summaryByMonth,
    simulatedByMonth,
    language
  }), [baseSummary, includeReal, language, months, summaryByMonth, simulatedByMonth]);

  const validItems = useMemo(() => activeItems.filter((item) => getItemTotal(item, language) > 0), [activeItems, language]);
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
  const addItem = () => setItems((current) => [...current, blankItem()]);
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
    const amount = getItemTotal(item, language);
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

    const scheduledValues = getItemValues(item, language)
      .map((value, index) => ({ value: Number(value || 0), index }))
      .filter((entry) => entry.value > 0);
    if (item.mode === "recurring" || item.type === "income") {
      await Promise.all(scheduledValues.map((entry, index) => createTransaction({
        date: monthStartDate(monthFromIndex(monthIndex(item.month) + entry.index).value),
        type: "income",
        amount: entry.value,
        description: `${description} (${index + 1}/${scheduledValues.length})`,
        is_future: monthStartDate(monthFromIndex(monthIndex(item.month) + entry.index).value) > todayIsoDate()
      })));
      return 1;
    }

    const firstInvoice = findInvoiceForMonth(invoices, item.month);
    if (!firstInvoice) throw new Error(`Crie uma fatura elegível em ${formatMonthLabel(...item.month.split("-").map(Number), language)} antes de inserir "${description}".`);

    await createInstallment({
      description,
      total_amount: amount,
      installment_count: scheduledValues.length,
      first_invoice_id: Number(firstInvoice.id),
      items: scheduledValues.map((entry, index) => ({
        invoice_id: index === 0 ? Number(firstInvoice.id) : null,
        amount: entry.value,
        target_due_date: addMonthsToDate(firstInvoice.due_date, entry.index)
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
            <button className="btn btn-ghost" type="button" onClick={addItem}>
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
                              <strong>{entry.description}{entry.installmentLabel ? ` - ${entry.periodType} ${entry.installmentLabel}` : ""}</strong>
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
