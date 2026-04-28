import { useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import MonthlyTable from "./components/MonthlyTable.jsx";
import InvoiceCard from "./components/InvoiceCard.jsx";
import TransactionForm from "./components/TransactionForm.jsx";
import { useTheme } from "./hooks/useTheme.js";
import {
  addInvoiceItem,
  applyRecurrences,
  createInvoice,
  createRecurrence,
  createTransaction,
  deleteInvoiceItem,
  deleteTransaction,
  getMonth,
  getMonthSummary,
  listInvoices,
  updateTransaction
} from "./api/api.js";
import { formatMoney, formatMonthLabel } from "./utils/format.js";

function shiftMonth(year, month, delta) {
  const total = year * 12 + month - 1 + delta;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1
  };
}

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthData, setMonthData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const [invoiceForm, setInvoiceForm] = useState({
    name: "",
    due_date: "",
    initial_amount: ""
  });

  const { theme, setTheme } = useTheme();

  const invoiceMap = useMemo(() => {
    const map = new Map();
    invoices.forEach((invoice) => map.set(invoice.id, invoice));
    return map;
  }, [invoices]);

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    async function loadMonth() {
      setLoading(true);
      try {
        const [monthPayload, summaryPayload, invoicesPayload] = await Promise.all([
          getMonth(year, month),
          getMonthSummary(year, month),
          listInvoices()
        ]);
        setMonthData(monthPayload);
        setSummary(summaryPayload);
        setInvoices(invoicesPayload);
        setError(null);

        const comparisonOffsets = [-3, -2, -1];
        const summaryList = await Promise.all(
          comparisonOffsets.map(async (offset) => {
            const target = shiftMonth(year, month, offset);
            const data = await getMonthSummary(target.year, target.month);
            return {
              label: formatMonthLabel(target.year, target.month),
              total_expenses: data.total_expenses,
              total_income: data.total_income
            };
          })
        );
        setComparisons(summaryList);
      } catch (err) {
        setError(err.message || "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    }

    loadMonth();
  }, [year, month]);

  const handlePrevMonth = () => {
    const target = shiftMonth(year, month, -1);
    setYear(target.year);
    setMonth(target.month);
  };

  const handleNextMonth = () => {
    const target = shiftMonth(year, month, 1);
    setYear(target.year);
    setMonth(target.month);
  };

  const handleToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  const openAddForm = (dateString) => {
    setSelectedDate(dateString);
    setEditing(null);
    setFormOpen(true);
  };

  const openEditForm = (transaction) => {
    setEditing(transaction);
    setSelectedDate(transaction.date);
    setFormOpen(true);
  };

  const handleSaveTransaction = async (payload) => {
    if (editing) {
      await updateTransaction(editing.id, payload.data);
    } else {
      let recurrenceId = payload.data.recurrence_id;
      if (payload.recurrence && payload.recurrence.enabled) {
        const recurrence = await createRecurrence({
          description: payload.data.description || "Recorrencia",
          type: payload.data.type,
          amount: payload.data.amount,
          day_of_month: payload.recurrence.day_of_month,
          active: true
        });
        recurrenceId = recurrence.id;
      }

      await createTransaction({
        ...payload.data,
        recurrence_id: recurrenceId
      });
    }

    const monthPayload = await getMonth(year, month);
    const summaryPayload = await getMonthSummary(year, month);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
    setFormOpen(false);
  };

  const handleDeleteTransaction = async (transactionId) => {
    await deleteTransaction(transactionId);
    const monthPayload = await getMonth(year, month);
    const summaryPayload = await getMonthSummary(year, month);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
  };

  const handleCreateInvoice = async (event) => {
    event.preventDefault();
    if (!invoiceForm.name || !invoiceForm.due_date) {
      return;
    }
    await createInvoice({
      name: invoiceForm.name,
      due_date: invoiceForm.due_date,
      initial_amount: invoiceForm.initial_amount || 0
    });
    setInvoiceForm({ name: "", due_date: "", initial_amount: "" });
    const [invoicesPayload, monthPayload, summaryPayload] = await Promise.all([
      listInvoices(),
      getMonth(year, month),
      getMonthSummary(year, month)
    ]);
    setInvoices(invoicesPayload);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
  };

  const handleAddInvoiceItem = async (invoiceId, payload) => {
    await addInvoiceItem(invoiceId, payload);
    const invoicesPayload = await listInvoices();
    setInvoices(invoicesPayload);
    const monthPayload = await getMonth(year, month);
    const summaryPayload = await getMonthSummary(year, month);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
  };

  const handleDeleteInvoiceItem = async (invoiceId, itemId) => {
    await deleteInvoiceItem(invoiceId, itemId);
    const [invoicesPayload, monthPayload, summaryPayload] = await Promise.all([
      listInvoices(),
      getMonth(year, month),
      getMonthSummary(year, month)
    ]);
    setInvoices(invoicesPayload);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
  };

  const handleApplyRecurrences = async () => {
    await applyRecurrences(year, month);
    const monthPayload = await getMonth(year, month);
    const summaryPayload = await getMonthSummary(year, month);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
  };

  const balanceSeries = monthData?.days?.map((day) => ({
    date: day.date,
    balance: day.balance
  })) || [];

  return (
    <div className="min-h-screen px-6 py-10 lg:px-12 app-shell">
      <header className="top-bar">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="brand">
            <span className="brand-dot" />
            <div>
              <p className="brand-title">Finance Tracker</p>
              <p className="brand-sub">Controle financeiro pessoal</p>
            </div>
          </div>
          <div className="toolbar">
            <button className="btn" onClick={handlePrevMonth}>
              Mes anterior
            </button>
            <button className="btn" onClick={handleToday}>
              Hoje
            </button>
            <button className="btn" onClick={handleNextMonth}>
              Proximo mes
            </button>
            <input
              className="input-month"
              type="month"
              value={monthInputValue}
              onChange={(event) => {
                const [nextYear, nextMonth] = event.target.value
                  .split("-")
                  .map(Number);
                if (nextYear && nextMonth) {
                  setYear(nextYear);
                  setMonth(nextMonth);
                }
              }}
            />
            <button
              className="btn btn-ghost"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              Tema {theme === "dark" ? "claro" : "escuro"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="chip">{formatMonthLabel(year, month)}</span>
          {summary && (
            <>
              <span className="chip chip-balance">
                Saldo atual {formatMoney(summary.current_balance)}
              </span>
              <span className="chip chip-expense">
                Gastos {formatMoney(summary.total_expenses)}
              </span>
              <span className="chip chip-income">
                Ganhos {formatMoney(summary.total_income)}
              </span>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-10 text-slate-500">Carregando...</div>
      ) : (
        <>
          <section className="mt-8 fade-up" key={`${year}-${month}-dashboard`}>
            {summary && (
              <Dashboard
                summary={summary}
                balanceSeries={balanceSeries}
                comparisons={comparisons}
              />
            )}
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="glass-card rounded-3xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Tabela mensal</h2>
                  {monthData && (
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Saldo inicial {formatMoney(monthData.opening_balance)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-expense">Gastos</span>
                  <span className="chip chip-income">Ganhos</span>
                  <span className="chip chip-balance">Saldo</span>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      openAddForm(
                        new Date(year, month - 1, 1)
                          .toISOString()
                          .slice(0, 10)
                      )
                    }
                  >
                    Novo lancamento
                  </button>
                </div>
              </div>
              {monthData?.days?.length ? (
                <MonthlyTable
                  days={monthData.days}
                  summary={summary}
                  onAdd={openAddForm}
                  onEdit={openEditForm}
                  onDelete={handleDeleteTransaction}
                  invoicesById={invoiceMap}
                />
              ) : (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40">
                  Mes vazio. Deseja aplicar recorrencias?
                  <button
                    className="ml-3 btn btn-xs"
                    onClick={handleApplyRecurrences}
                  >
                    Aplicar agora
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="glass-card rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Faturas futuras</h2>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Atualize suas faturas
                    </p>
                  </div>
                  <button
                    className="btn btn-xs"
                    onClick={handleApplyRecurrences}
                  >
                    Aplicar recorrencias
                  </button>
                </div>

                <form className="mt-4 grid gap-3" onSubmit={handleCreateInvoice}>
                  <input
                    className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
                    placeholder="Descricao"
                    value={invoiceForm.name}
                    onChange={(event) =>
                      setInvoiceForm({ ...invoiceForm, name: event.target.value })
                    }
                  />
                  <input
                    className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
                    type="date"
                    value={invoiceForm.due_date}
                    onChange={(event) =>
                      setInvoiceForm({ ...invoiceForm, due_date: event.target.value })
                    }
                  />
                  <input
                    className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
                    type="number"
                    step="0.01"
                    placeholder="Valor inicial"
                    value={invoiceForm.initial_amount}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        initial_amount: event.target.value
                      })
                    }
                  />
                  <button className="btn btn-primary" type="submit">
                    Criar fatura
                  </button>
                </form>
              </div>

              <div className="space-y-4">
                {invoices.length ? (
                  invoices.map((invoice) => (
                    <InvoiceCard
                      key={invoice.id}
                      invoice={invoice}
                      onAddItem={handleAddInvoiceItem}
                      onDeleteItem={handleDeleteInvoiceItem}
                    />
                  ))
                ) : (
                  <div className="glass-card rounded-3xl p-6 text-sm text-slate-500">
                    Nenhuma fatura futura cadastrada.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      <TransactionForm
        open={formOpen}
        initial={editing}
        date={selectedDate}
        onClose={() => setFormOpen(false)}
        onSave={handleSaveTransaction}
      />
    </div>
  );
}
