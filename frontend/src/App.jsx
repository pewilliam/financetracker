import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  CreditCard,
  Eye,
  Grid2X2,
  List,
  LogOut,
  Menu,
  Moon,
  Plus,
  Repeat,
  Settings,
  Sun,
  Trash2,
  Wallet,
  X
} from "lucide-react";
import Dashboard from "./components/Dashboard.jsx";
import MonthlyTable from "./components/MonthlyTable.jsx";
import InvoiceCard from "./components/InvoiceCard.jsx";
import TransactionForm from "./components/TransactionForm.jsx";
import { useTheme } from "./hooks/useTheme.js";
import { useAuth } from "./hooks/useAuth.jsx";
import {
  addInvoiceItem,
  applyRecurrences,
  createInstallment,
  createInvoice,
  createRecurrence,
  createTransaction,
  deleteInstallment,
  deleteInstallmentItem,
  deleteInvoiceItem,
  deleteTransaction,
  getInstallment,
  getMonth,
  getMonthSummary,
  getMonthsSummary,
  listInstallments,
  listInvoices,
  setInvoicePaid,
  setOpeningBalance,
  updatePassword,
  updateTransaction
} from "./api/api.js";
import { formatDateShort, formatMoney, formatMoneyInput, formatMonthLabel, parseMoneyInput } from "./utils/format.js";

function shiftMonth(year, month, delta) {
  const total = year * 12 + month - 1 + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function addMonthsToDate(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const shifted = shiftMonth(year, month, amount);
  const lastDay = lastDayOfMonth(shifted.year, shifted.month);
  return `${shifted.year}-${String(shifted.month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function nextMonthDate(dateString) {
  return addMonthsToDate(dateString, 1);
}

function defaultInvoiceForm() {
  return { name: "", due_date: "", initial_amount: "", duplicate_next_month: false, duplicate_months: 1 };
}

function defaultInstallmentForm(firstInvoiceId = "") {
  return {
    description: "",
    total_amount: "",
    installment_count: 1,
    first_invoice_id: firstInvoiceId,
    different_values: false
  };
}

function Protected({ children }) {
  const auth = useAuth();
  if (auth.loading) return <div className="center-screen">Carregando sessão...</div>;
  if (!auth.authenticated) return <Navigate to="/login" replace />;
  return children;
}

function AuthPage({ mode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const isRegister = mode === "register";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  if (auth.authenticated) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (isRegister) await auth.signUp(form);
      else await auth.signIn({ email: form.email, password: form.password });
      toast.success(isRegister ? "Conta criada com sucesso" : "Login realizado");
      navigate("/");
    } catch {
      toast.error(isRegister ? "Erro ao criar conta" : "E-mail ou senha inválidos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <Toaster position="top-right" />
      <section className="auth-card">
        <div className="auth-logo"><Wallet size={28} /></div>
        <h1>Finance Tracker</h1>
        <p>{isRegister ? "Crie sua conta para começar." : "Entre para ver seus dados financeiros."}</p>
        <form className="form-stack" onSubmit={submit}>
          {isRegister && (
            <label><span>Nome</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          )}
          <label><span>E-mail</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label><span>Senha</span><input type="password" minLength="6" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
          <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? "Aguarde..." : isRegister ? "Criar conta" : "Entrar"}</button>
        </form>
        <Link className="auth-link" to={isRegister ? "/login" : "/register"}>
          {isRegister ? "Já tenho conta" : "Criar cadastro"}
        </Link>
      </section>
    </main>
  );
}

function Sidebar({ open, setOpen }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const links = [
    ["Dashboard", "/", BarChart3],
    ["Meses", "/meses", CalendarDays],
    ["Faturas", "/faturas", CreditCard],
    ["Parcelamentos", "/parcelamentos", CreditCard],
    ["Recorrências", "/recorrencias", Repeat],
    ["Configurações", "/configuracoes", Settings]
  ];
  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand"><Wallet /><span>Finance Tracker</span><button className="icon-btn sidebar-close" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <nav>
          {links.map(([label, path, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"} onClick={() => setOpen(false)}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} Tema
          </button>
          <div className="user-card">
            <div className="avatar">{user?.name?.[0]?.toUpperCase() || "U"}</div>
            <div><strong>{user?.name}</strong><span>{user?.email}</span></div>
          </div>
          <button className="logout" onClick={logout}><LogOut size={16} /> Sair</button>
        </div>
      </aside>
      {open && <button className="mobile-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" />}
    </>
  );
}

function AppShell() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthData, setMonthData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [monthCards, setMonthCards] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm);
  const [installmentModal, setInstallmentModal] = useState(false);
  const [installmentForm, setInstallmentForm] = useState(defaultInstallmentForm);
  const [installmentDetails, setInstallmentDetails] = useState(null);

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

  async function refresh() {
    setLoading(true);
    try {
      const offsets = [-5, -4, -3, -2, -1, 0];
      const [monthPayload, summaryPayload, invoicesPayload, installmentsPayload, monthCardsPayload, comparisonPayload] = await Promise.all([
        getMonth(year, month),
        getMonthSummary(year, month),
        listInvoices(),
        listInstallments(),
        getMonthsSummary(),
        Promise.all(offsets.map(async (offset) => {
          const target = shiftMonth(year, month, offset);
          const data = await getMonthSummary(target.year, target.month);
          return { label: formatMonthLabel(target.year, target.month).slice(0, 3), ...data };
        }))
      ]);
      setMonthData(monthPayload);
      setSummary(summaryPayload);
      setInvoices(invoicesPayload);
      setInstallments(installmentsPayload);
      setMonthCards(monthCardsPayload);
      setComparisons(comparisonPayload);
    } catch (error) {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [year, month]);

  const balanceSeries = useMemo(() => monthData?.days?.map((day) => ({ date: day.date, balance: day.balance })) || [], [monthData]);

  const openAddForm = (dateString) => {
    setSelectedDate(dateString);
    setEditing(null);
    setDrawerOpen(true);
  };

  const saveTransaction = async (payload) => {
    try {
      if (editing) {
        await updateTransaction(editing.id, payload.data);
      } else {
        if (payload.recurrence?.enabled) {
          await createRecurrence({
            description: payload.data.description || "Recorrência",
            type: payload.data.type,
            amount: payload.data.amount,
            day_of_month: payload.recurrence.day_of_month,
            recurrence_months: payload.recurrence.recurrence_months,
            start_date: payload.data.date,
            active: true
          });
        } else {
          await createTransaction(payload.data);
        }
      }
      toast.success("Lançamento salvo");
      setDrawerOpen(false);
      await refresh();
    } catch {
      toast.error("Erro ao salvar lançamento");
    }
  };

  const removeTransaction = async (id) => {
    try {
      await deleteTransaction(id);
      toast.success("Item removido");
      await refresh();
    } catch {
      toast.error("Erro ao remover item");
    }
  };

  const createNewInvoice = async (drafts) => {
    try {
      await Promise.all(drafts.map((draft) => createInvoice({
        name: draft.name,
        due_date: draft.due_date,
        initial_amount: parseMoneyInput(draft.initial_amount)
      })));
      setInvoiceForm(defaultInvoiceForm());
      setInvoiceModal(false);
      toast.success(`${drafts.length} ${drafts.length === 1 ? "fatura criada" : "faturas criadas"} com sucesso!`);
      await refresh();
    } catch {
      toast.error("Erro ao criar fatura");
    }
  };

  const openNewInvoiceModal = () => {
    setInvoiceForm(defaultInvoiceForm());
    setInvoiceModal(true);
  };

  const openDuplicateInvoiceModal = (invoice) => {
    setInvoiceForm({
      name: invoice.name,
      due_date: nextMonthDate(invoice.due_date),
      initial_amount: formatMoney(invoice.total_amount),
      duplicate_next_month: false,
      duplicate_months: 1
    });
    setInvoiceModal(true);
  };

  const openInstallmentModal = (invoice = null) => {
    setInstallmentForm(defaultInstallmentForm(invoice?.id || invoices[0]?.id || ""));
    setInstallmentModal(true);
  };

  const createNewInstallment = async (payload) => {
    try {
      await createInstallment(payload);
      setInstallmentForm(defaultInstallmentForm());
      setInstallmentModal(false);
      toast.success("Compra parcelada criada");
      await refresh();
    } catch {
      toast.error("Erro ao criar compra parcelada");
    }
  };

  const removeInstallment = async (id) => {
    try {
      await deleteInstallment(id);
      setInstallmentDetails(null);
      toast.success("Compra parcelada removida");
      await refresh();
    } catch {
      toast.error("Erro ao remover compra parcelada");
    }
  };

  const removeInstallmentItem = async (id) => {
    try {
      await deleteInstallmentItem(id);
      toast.success("Parcela removida");
      await refresh();
    } catch {
      toast.error("Erro ao remover parcela");
    }
  };

  const showInstallmentDetails = async (id) => {
    try {
      setInstallmentDetails(await getInstallment(id));
    } catch {
      toast.error("Erro ao carregar parcelamento");
    }
  };

  const addItem = async (invoiceId, payload) => {
    try {
      await addInvoiceItem(invoiceId, payload);
      toast.success("Item adicionado");
      await refresh();
    } catch {
      toast.error("Erro ao adicionar item");
    }
  };

  const deleteItem = async (invoiceId, itemId) => {
    try {
      await deleteInvoiceItem(invoiceId, itemId);
      toast.success("Item removido");
      await refresh();
    } catch {
      toast.error("Erro ao remover item");
    }
  };

  const toggleInvoicePaid = async (invoiceId, paid) => {
    try {
      await setInvoicePaid(invoiceId, paid);
      toast.success(paid ? "Fatura marcada como paga" : "Fatura marcada como pendente");
      await refresh();
    } catch {
      toast.error("Erro ao atualizar fatura");
    }
  };

  const applyMonthRecurrences = async () => {
    await applyRecurrences(year, month);
    toast.success("Recorrências aplicadas");
    await refresh();
  };

  return (
    <div className="app-layout">
      <Toaster position="top-right" />
      <Sidebar open={menuOpen} setOpen={setMenuOpen} />
      <main className="content">
        <div className="content-inner">
          <header className="page-header">
            <div>
              <p className="eyebrow">{formatMonthLabel(year, month)}</p>
              <h1>Controle financeiro</h1>
            </div>
            <div className="toolbar">
              <button className="btn" onClick={() => { const t = shiftMonth(year, month, -1); setYear(t.year); setMonth(t.month); }}>Anterior</button>
              <input type="month" value={monthInputValue} onChange={(event) => { const [y, m] = event.target.value.split("-").map(Number); if (y && m) { setYear(y); setMonth(m); } }} />
              <button className="btn" onClick={() => { const t = shiftMonth(year, month, 1); setYear(t.year); setMonth(t.month); }}>Próximo</button>
              <button className="btn btn-primary" onClick={() => openAddForm(`${year}-${String(month).padStart(2, "0")}-01`)}><Plus size={16} /> Novo</button>
            </div>
          </header>

          {loading ? <Skeleton /> : (
            <Routes>
              <Route path="/" element={<Dashboard summary={summary} balanceSeries={balanceSeries} comparisons={comparisons} invoices={invoices} monthData={monthData} />} />
              <Route path="/meses" element={<MonthsPage monthData={monthData} summary={summary} monthCards={monthCards} year={year} month={month} setYear={setYear} setMonth={setMonth} openAddForm={openAddForm} setEditing={setEditing} setDrawerOpen={setDrawerOpen} removeTransaction={removeTransaction} applyMonthRecurrences={applyMonthRecurrences} />} />
              <Route path="/faturas" element={<InvoicesPage invoices={invoices} addItem={addItem} addInstallment={openInstallmentModal} deleteItem={deleteItem} deleteInstallmentItem={removeInstallmentItem} togglePaid={toggleInvoicePaid} openModal={openNewInvoiceModal} openInstallmentModal={() => openInstallmentModal()} openDuplicateInvoiceModal={openDuplicateInvoiceModal} onViewInstallment={showInstallmentDetails} />} />
              <Route path="/parcelamentos" element={<InstallmentsPage installments={installments} onNew={() => openInstallmentModal()} onDetails={showInstallmentDetails} />} />
              <Route path="/recorrencias" element={<SimplePage title="Recorrências" text="As recorrências agora são criadas automaticamente pelo período informado no lançamento. Este botão permanece para recorrências antigas." action={applyMonthRecurrences} />} />
              <Route path="/configuracoes" element={<SettingsPage summary={summary} monthLabel={formatMonthLabel(year, month)} monthData={monthData} year={year} month={month} refresh={refresh} />} />
            </Routes>
          )}
        </div>
      </main>

      <TransactionForm open={drawerOpen} initial={editing} date={selectedDate} invoices={invoices} onClose={() => setDrawerOpen(false)} onSave={saveTransaction} />
      {invoiceModal && <InvoiceModal form={invoiceForm} setForm={setInvoiceForm} onSubmit={createNewInvoice} onClose={() => setInvoiceModal(false)} />}
      {installmentModal && <InstallmentModal form={installmentForm} setForm={setInstallmentForm} invoices={invoices} onSubmit={createNewInstallment} onClose={() => setInstallmentModal(false)} />}
      {installmentDetails && <InstallmentDetailsModal purchase={installmentDetails} onClose={() => setInstallmentDetails(null)} onDelete={removeInstallment} />}
    </div>
  );
}

function AnimatedMoney({ value, className = "" }) {
  const [display, setDisplay] = useState(Number(value || 0));

  useEffect(() => {
    const start = display;
    const end = Number(value || 0);
    const startedAt = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / 400, 1);
      setDisplay(start + (end - start) * progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{formatMoney(display)}</span>;
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function quickAddDate(year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const day = year === currentYear && month === currentMonth ? now.getDate() : lastDayOfMonth(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function MonthCard({ item, onView, onQuickAdd }) {
  const net = Number(item.total_income || 0) - Number(item.total_expenses || 0);
  const closingDelta = Number(item.closing_balance || 0) - Number(item.opening_balance || 0);
  const tone = net > 0 ? "positive" : net < 0 ? "negative" : "neutral";
  const pct = Number(item.difference_pct || 0);
  const barWidth = Math.min(Math.abs(pct), 100);

  return (
    <article className={`month-card ${tone}`}>
      <header className="month-card-head">
        <h3>{item.label}</h3>
        <button className="btn btn-ghost compact" onClick={onView}>Ver</button>
      </header>
      <div className="month-card-body">
        <div className="metric-row"><span>Saldo inicial</span><AnimatedMoney value={item.opening_balance} /></div>
        <div className="metric-separator" />
        <div className="metric-row"><span><i className="metric-dot expense" />Gastos</span><AnimatedMoney value={item.total_expenses} /></div>
        <div className="metric-row"><span><i className="metric-dot income" />Ganhos</span><AnimatedMoney value={item.total_income} /></div>
        <div className="metric-separator" />
        <div className="metric-row closing">
          <span>Fechamento</span>
          <AnimatedMoney value={item.closing_balance} className={closingDelta >= 0 ? "money-income" : "money-expense"} />
        </div>
        <div className="difference-row">
          <div className={`difference-track ${pct >= 0 ? "positive" : "negative"}`}>
            <span style={{ width: `${barWidth}%` }} />
          </div>
          <strong className={pct >= 0 ? "money-income" : "money-expense"}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</strong>
        </div>
      </div>
      <footer className="month-card-footer">
        <button className="btn btn-ghost" onClick={onQuickAdd}><Plus size={16} /> Adicionar lançamento rápido</button>
      </footer>
    </article>
  );
}

function MonthsPage({ monthData, summary, monthCards, year, month, setYear, setMonth, openAddForm, setEditing, setDrawerOpen, removeTransaction, applyMonthRecurrences }) {
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("months-view-mode") || "table");

  const changeView = (mode) => {
    setViewMode(mode);
    localStorage.setItem("months-view-mode", mode);
  };

  const openMonthTable = (target) => {
    setYear(target.year);
    setMonth(target.month);
    changeView("table");
  };

  return (
    <section className={viewMode === "table" ? "card" : undefined}>
      <div className="section-head">
        <div><p className="eyebrow">Saldo inicial {formatMoney(monthData.opening_balance)}</p><h2>{viewMode === "table" ? "Tabela mensal" : "Meses"}</h2></div>
        <div className="view-actions">
          <div className="view-toggle" aria-label="Alternar visualização">
            <button className={viewMode === "cards" ? "active" : ""} onClick={() => changeView("cards")}><Grid2X2 size={16} /> Cards</button>
            <button className={viewMode === "table" ? "active" : ""} onClick={() => changeView("table")}><List size={16} /> Tabela</button>
          </div>
          {viewMode === "table" && <button className="btn" onClick={applyMonthRecurrences}>Aplicar recorrências</button>}
        </div>
      </div>
      {viewMode === "table" ? (
        <MonthlyTable days={monthData.days} summary={summary} onAdd={openAddForm} onEdit={(tx) => { setEditing(tx); setDrawerOpen(true); }} onDelete={removeTransaction} />
      ) : (
        <div className="month-card-grid">
          {monthCards.length ? monthCards.map((item) => (
            <MonthCard
              key={`${item.year}-${item.month}`}
              item={item}
              onView={() => openMonthTable(item)}
              onQuickAdd={() => openAddForm(quickAddDate(item.year, item.month))}
            />
          )) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhum mês com lançamentos.</h3><p>Clique em + Novo para começar.</p></div>}
        </div>
      )}
    </section>
  );
}

function InvoicesPage({ invoices, addItem, addInstallment, deleteItem, deleteInstallmentItem, togglePaid, openModal, openInstallmentModal, openDuplicateInvoiceModal, onViewInstallment }) {
  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">Faturas futuras</p><h2>Faturas</h2></div>
        <div className="view-actions">
          <button className="btn" onClick={openInstallmentModal}><CreditCard size={16} /> Compra parcelada</button>
          <button className="btn btn-primary" onClick={openModal}><Plus size={16} /> Nova fatura</button>
        </div>
      </div>
      {invoices.length ? <div className="invoice-grid">{invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} onAddItem={addItem} onAddInstallment={addInstallment} onDeleteItem={deleteItem} onDeleteInstallmentItem={deleteInstallmentItem} onTogglePaid={togglePaid} onDuplicateNext={openDuplicateInvoiceModal} onViewInstallment={onViewInstallment} />)}</div> : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura cadastrada.</h3><p>Clique em Nova fatura para criar.</p></div>}
      <button className="fab" onClick={openModal} aria-label="Criar fatura"><Plus /></button>
    </section>
  );
}

function InstallmentsPage({ installments, onNew, onDetails }) {
  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">Compras parceladas</p><h2>Parcelamentos</h2></div>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Compra parcelada</button>
      </div>
      {installments.length ? (
        <div className="installment-grid">
          {installments.map((purchase) => {
            const pct = purchase.installment_count ? (purchase.paid_installments / purchase.installment_count) * 100 : 0;
            const next = purchase.next_installment?.invoice;
            return (
              <article className="installment-card" key={purchase.id}>
                <header>
                  <h3><CreditCard size={18} /> {purchase.description}</h3>
                  {purchase.paid_installments === purchase.installment_count && <span className="paid-pill">QUITADA</span>}
                </header>
                <p>{formatMoney(purchase.total_amount)} • {purchase.installment_count}x {formatMoney(purchase.installment_value)}</p>
                <div className="installment-progress"><span style={{ width: `${pct}%` }} /></div>
                <strong>Progresso: {purchase.paid_installments} / {purchase.installment_count}</strong>
                <p>Pago: {formatMoney(purchase.paid_amount)} • Restante: {formatMoney(purchase.remaining_amount)}</p>
                <p>Próxima parcela: {next ? `${next.name} — vence ${formatDateShort(next.due_date)}` : "Fatura removida — realocar"}</p>
                <button className="btn btn-ghost" onClick={() => onDetails(purchase.id)}><Eye size={16} /> Detalhes</button>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma compra parcelada.</h3><p>Use Compra parcelada para distribuir valores nas faturas.</p></div>}
    </section>
  );
}

function InstallmentModal({ form, setForm, invoices, onSubmit, onClose }) {
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const count = Math.min(48, Math.max(1, Number(form.installment_count) || 1));
  const total = parseMoneyInput(form.total_amount);
  const firstInvoice = invoices.find((invoice) => String(invoice.id) === String(form.first_invoice_id));
  const sortedInvoices = [...invoices].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const filteredInvoices = sortedInvoices.filter((invoice) => `${invoice.name} ${invoice.due_date}`.toLowerCase().includes(invoiceSearch.toLowerCase()));
  const perInstallment = count ? total / count : 0;
  const endDate = firstInvoice ? addMonthsToDate(firstInvoice.due_date, count - 1) : "";

  const matchingInvoice = (dateString) => invoices.find((invoice) => invoice.name === firstInvoice?.name && invoice.due_date.slice(0, 7) === dateString.slice(0, 7));

  const updateForm = (patch) => setForm({ ...form, ...patch });
  const handleMoneyChange = (value) => updateForm({ total_amount: formatMoneyInput(value) });

  const buildDrafts = () => Array.from({ length: count }, (_, index) => {
    const dueDate = addMonthsToDate(firstInvoice.due_date, index);
    const matched = matchingInvoice(dueDate);
    const amount = index === count - 1
      ? total - (Math.round(perInstallment * 100) / 100) * (count - 1)
      : perInstallment;
    return {
      id: `${Date.now()}-${index}`,
      number: index + 1,
      month: dueDate,
      invoice_id: matched?.id || "",
      amount: formatMoney(amount)
    };
  });

  const goToReview = (event) => {
    event.preventDefault();
    if (!form.description || !total || !firstInvoice) return;
    setDrafts(buildDrafts());
    setStep(2);
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const removeDraft = (id) => setDrafts((current) => current.filter((draft) => draft.id !== id));
  const confirmedTotal = drafts.reduce((sum, draft) => sum + parseMoneyInput(draft.amount), 0);
  const invoiceCount = new Set(drafts.map((draft) => draft.invoice_id || `auto-${draft.month}`)).size;
  const canCreate = drafts.length && drafts.every((draft) => parseMoneyInput(draft.amount) > 0);

  const submitDrafts = (event) => {
    event.preventDefault();
    if (!canCreate) return;
    onSubmit({
      description: form.description,
      total_amount: confirmedTotal,
      installment_count: drafts.length,
      first_invoice_id: Number(form.first_invoice_id),
      items: drafts.map((draft) => ({
        invoice_id: draft.invoice_id ? Number(draft.invoice_id) : null,
        amount: parseMoneyInput(draft.amount),
        target_due_date: draft.month
      }))
    });
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className={`modal-card invoice-modal installment-modal step-${step}`} onSubmit={step === 1 ? goToReview : submitDrafts}>
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div><p className="eyebrow">Compra parcelada</p><h2>Adicionar compra parcelada</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-stepper">
          <div className={`stepper-item ${step > 1 ? "done" : "active"}`}><span>{step > 1 ? <Check size={15} /> : "1"}</span><strong>Configurar</strong></div>
          <i />
          <div className={`stepper-item ${step === 2 ? "active" : ""}`}><span>2</span><strong>Revisar parcelas</strong></div>
        </div>
        {step === 1 ? (
          <>
            <div className="invoice-modal-body">
              <label><span>Descrição da compra</span><input value={form.description} onChange={(event) => updateForm({ description: event.target.value })} required /></label>
              <label><span>Valor total</span><input inputMode="numeric" placeholder="R$ 0,00" value={form.total_amount} onChange={(event) => handleMoneyChange(event.target.value)} required /></label>
              <label><span>Número de parcelas</span><input type="number" min="1" max="48" value={count} onChange={(event) => updateForm({ installment_count: Number(event.target.value) })} required /></label>
              <p className="computed-value">{formatMoney(perInstallment)} por parcela</p>
              <label className={`duplicate-option ${form.different_values ? "active" : ""}`}>
                <input type="checkbox" checked={form.different_values} onChange={(event) => updateForm({ different_values: event.target.checked })} />
                <span className="duplicate-icon"><CreditCard size={20} /></span>
                <span><strong>Parcelas com valores diferentes</strong><small>Edite cada valor na revisão.</small></span>
              </label>
              <label><span>Buscar fatura inicial</span><input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Nome ou data" /></label>
              <label><span>Fatura inicial</span><select value={form.first_invoice_id} onChange={(event) => updateForm({ first_invoice_id: event.target.value })} required>
                <option value="">Selecione uma fatura</option>
                {filteredInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.name} — vence {formatDateShort(invoice.due_date)}</option>)}
              </select></label>
              <p className="duplicate-summary">{firstInvoice ? `Parcelas distribuídas de ${formatMonthShort(firstInvoice.due_date)} até ${formatMonthShort(endDate)}` : "Selecione a fatura inicial para ver a distribuição."}</p>
            </div>
            <div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary">Próximo →</button></div>
          </>
        ) : (
          <>
            <div className="invoice-review">
              <div className="review-table">
                <div className="review-row installment-review-head"><span>#</span><span>Parcela</span><span>Fatura destino</span><span>Valor</span><span /></div>
                <div className="review-list">
                  {drafts.map((draft, index) => (
                    <div className="review-row installment-review-row" key={draft.id}>
                      <span>{draft.number}/{count}</span>
                      <strong>{formatMonthShort(draft.month)}</strong>
                      <label>
                        <select value={draft.invoice_id} onChange={(event) => updateDraft(draft.id, { invoice_id: event.target.value })}>
                          <option value="">Criar automaticamente</option>
                          {sortedInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.name} — {formatDateShort(invoice.due_date)}</option>)}
                        </select>
                        {!draft.invoice_id && <small className="auto-badge">Fatura será criada automaticamente</small>}
                      </label>
                      <input inputMode="numeric" value={draft.amount} readOnly={!form.different_values} onChange={(event) => updateDraft(draft.id, { amount: formatMoneyInput(event.target.value) })} />
                      <button className="icon-btn small danger" type="button" onClick={() => removeDraft(draft.id)} aria-label="Remover parcela"><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="review-footer">
              <div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>← Voltar</button><button className="btn btn-primary" disabled={!canCreate}>Confirmar {drafts.length} parcelas</button></div>
              <p>Valor total confirmado: <strong>{formatMoney(confirmedTotal)}</strong>{invoiceCount > 1 ? ` • Parcelas em ${invoiceCount} faturas diferentes` : ""}</p>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function InstallmentDetailsModal({ purchase, onClose, onDelete }) {
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <div className="modal-card invoice-modal installment-modal step-2">
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div><p className="eyebrow">{purchase.progress_label}</p><h2>{purchase.description}</h2></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <div className="invoice-review">
          <div className="review-table">
            <div className="review-row installment-review-head"><span>#</span><span>Parcela</span><span>Fatura</span><span>Status</span><span /></div>
            <div className="review-list">
              {purchase.items.map((item) => (
                <div className="review-row installment-review-row" key={item.id}>
                  <span>{item.installment_number}/{purchase.installment_count}</span>
                  <strong>{formatMoney(item.amount)}</strong>
                  <span>{item.invoice ? `${item.invoice.name} — ${formatDateShort(item.invoice.due_date)}` : "Fatura removida — realocar"}</span>
                  <span className={`due-badge compact ${item.invoice?.paid ? "paid" : item.invoice ? "" : "danger"}`}>{item.invoice?.paid ? "Paga" : item.invoice ? "Pendente" : "Órfã"}</span>
                  <span />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions details-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
          <button className="btn btn-ghost danger-text" type="button" onClick={() => onDelete(purchase.id)}><Trash2 size={16} /> Remover compra</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ form, setForm, onSubmit, onClose }) {
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const duplicateMonths = Math.min(23, Math.max(1, Number(form.duplicate_months) || 1));
  const totalCount = form.duplicate_next_month ? duplicateMonths + 1 : 1;
  const startLabel = form.due_date ? formatMonthShort(form.due_date) : "";
  const endLabel = form.due_date ? formatMonthShort(addMonthsToDate(form.due_date, totalCount - 1)) : "";

  const updateForm = (patch) => setForm({ ...form, ...patch });

  const buildDrafts = () => Array.from({ length: totalCount }, (_, index) => ({
    id: `${Date.now()}-${index}`,
    name: form.name,
    due_date: addMonthsToDate(form.due_date, index),
    initial_amount: form.initial_amount
  }));

  const goToReview = (event) => {
    event.preventDefault();
    if (!form.name || !form.due_date || !parseMoneyInput(form.initial_amount)) return;
    setDrafts(buildDrafts());
    setStep(2);
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const removeDraft = (id) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const matchFirstValue = () => {
    const first = drafts[0]?.initial_amount || "";
    setDrafts((current) => current.map((draft) => ({ ...draft, initial_amount: first })));
  };

  const resetAutomaticDates = () => {
    const firstDate = drafts[0]?.due_date;
    if (!firstDate) return;
    setDrafts((current) => current.map((draft, index) => ({ ...draft, due_date: addMonthsToDate(firstDate, index) })));
  };

  const rowError = (draft) => {
    if (!draft.due_date) return "Informe uma data válida.";
    if (!parseMoneyInput(draft.initial_amount)) return "Informe um valor maior que zero.";
    return "";
  };

  const validDrafts = drafts.filter((draft) => !rowError(draft));
  const canCreate = drafts.length > 0 && validDrafts.length === drafts.length;
  const totalCommitted = drafts.reduce((sum, draft) => sum + parseMoneyInput(draft.initial_amount), 0);

  const submitDrafts = (event) => {
    event.preventDefault();
    if (!canCreate) return;
    onSubmit(drafts);
  };

  const handleMoneyChange = (value, setter) => {
    setter(formatMoneyInput(value));
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className={`modal-card invoice-modal step-${step}`} onSubmit={step === 1 ? goToReview : submitDrafts}>
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div>
            <p className="eyebrow">Cadastro de fatura</p>
            <h2>Nova fatura</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>

        <div className="invoice-stepper" aria-label="Etapas da criação de fatura">
          <div className={`stepper-item ${step > 1 ? "done" : "active"}`}>
            <span>{step > 1 ? <Check size={15} /> : "1"}</span>
            <strong>Configurar</strong>
          </div>
          <i />
          <div className={`stepper-item ${step === 2 ? "active" : ""}`}>
            <span>2</span>
            <strong>Revisar e ajustar</strong>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="invoice-modal-body">
              <label><span>Nome da fatura</span><input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} required /></label>
              <label><span>Data de vencimento da primeira fatura</span><input type="date" value={form.due_date} onChange={(event) => updateForm({ due_date: event.target.value })} required /></label>
              <label><span>Valor inicial</span><input inputMode="numeric" placeholder="R$ 0,00" value={form.initial_amount} onChange={(event) => handleMoneyChange(event.target.value, (value) => updateForm({ initial_amount: value }))} /></label>

              <label className={`duplicate-option ${form.duplicate_next_month ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={form.duplicate_next_month}
                  onChange={(event) => updateForm({ duplicate_next_month: event.target.checked })}
                />
                <span className="duplicate-icon"><CalendarPlus size={20} /></span>
                <span>
                  <strong>Duplicar para os próximos meses</strong>
                  <small>Gere faturas futuras e revise cada mês antes de confirmar.</small>
                </span>
              </label>

              {form.duplicate_next_month && (
                <div className="duplicate-range">
                  <div className="range-head">
                    <span>Quantidade de meses adicionais</span>
                    <input
                      type="number"
                      min="1"
                      max="23"
                      value={duplicateMonths}
                      onChange={(event) => updateForm({ duplicate_months: Math.min(23, Math.max(1, Number(event.target.value) || 1)) })}
                    />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="23"
                    value={duplicateMonths}
                    onChange={(event) => updateForm({ duplicate_months: Number(event.target.value) })}
                  />
                  <div className="range-scale"><span>1 mês</span><span>23 meses</span></div>
                  <p className="duplicate-summary">
                    {form.due_date
                      ? `Serão criadas ${totalCount} faturas no total (${startLabel} até ${endLabel})`
                      : `Serão criadas ${totalCount} faturas no total`}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary">Próximo →</button>
            </div>
          </>
        ) : (
          <>
            <div className="invoice-review">
              <div className="review-toolbar">
                <button className="btn btn-ghost compact" type="button" onClick={matchFirstValue}>Igualar todos os valores ao primeiro</button>
                <button className="btn btn-ghost compact" type="button" onClick={resetAutomaticDates}>Resetar datas automáticas</button>
              </div>

              <div className="review-table">
                <div className="review-row review-head">
                  <span>#</span>
                  <span>Mês</span>
                  <span>Data de venc.</span>
                  <span>Valor</span>
                  <span />
                </div>
                <div className="review-list">
                  {drafts.map((draft, index) => {
                    const error = rowError(draft);
                    return (
                      <div className={`review-row ${error ? "has-error" : ""}`} key={draft.id} title={error}>
                        <span>{index + 1}</span>
                        <strong>{draft.due_date ? formatMonthShort(draft.due_date) : "-"}</strong>
                        <input type="date" value={draft.due_date} onChange={(event) => updateDraft(draft.id, { due_date: event.target.value })} />
                        <input inputMode="numeric" value={draft.initial_amount} onChange={(event) => handleMoneyChange(event.target.value, (value) => updateDraft(draft.id, { initial_amount: value }))} />
                        <button className="icon-btn small danger" type="button" onClick={() => removeDraft(draft.id)} aria-label="Remover fatura"><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="review-footer">
              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>← Voltar</button>
                <button className="btn btn-primary" disabled={!canCreate}>Criar {drafts.length} {drafts.length === 1 ? "fatura" : "faturas"}</button>
              </div>
              <p>Total comprometido: <strong>{formatMoney(totalCommitted)}</strong></p>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function formatMonthShort(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const label = date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function SettingsPage({ summary, monthLabel, monthData, year, month, refresh }) {
  const { user, updateProfile } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [password, setPassword] = useState({ current_password: "", new_password: "" });
  const [openingBalance, setOpeningBalanceInput] = useState("");

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      await updateProfile(profile);
      toast.success("Perfil atualizado");
    } catch {
      toast.error("Erro ao atualizar perfil");
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    try {
      await updatePassword(password);
      setPassword({ current_password: "", new_password: "" });
      toast.success("Senha atualizada");
    } catch {
      toast.error("Erro ao trocar senha");
    }
  };

  const saveOpeningBalance = async (event) => {
    event.preventDefault();
    try {
      await setOpeningBalance(year, month, parseMoneyInput(openingBalance));
      toast.success("Saldo inicial atualizado");
      await refresh();
    } catch {
      toast.error("Erro ao salvar saldo inicial");
    }
  };

  const exportCsv = () => {
    const rows = [["data", "tipo", "valor", "descricao"], ...monthData.days.flatMap((day) => day.transactions.map((tx) => [tx.date, tx.type, tx.amount, tx.description || ""]))];
    const csv = rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-${monthLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="settings-grid">
      <form className="card" onSubmit={saveProfile}><h2>Perfil</h2><div className="form-stack"><label><span>Nome</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label><span>E-mail</span><input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label><button className="btn btn-primary">Salvar perfil</button></div></form>
      <form className="card" onSubmit={savePassword}><h2>Senha</h2><div className="form-stack"><label><span>Senha atual</span><input type="password" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} /></label><label><span>Nova senha</span><input type="password" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} /></label><button className="btn">Trocar senha</button></div></form>
      <form className="card" onSubmit={saveOpeningBalance}><h2>Saldo inicial</h2><p className="muted">Saldo atual: {formatMoney(summary.current_balance)}</p><div className="form-stack"><label><span>Saldo do mês</span><input placeholder="R$ 0,00" value={openingBalance} onChange={(event) => setOpeningBalanceInput(event.target.value)} /></label><button className="btn">Salvar saldo</button></div></form>
      <div className="card"><h2>Exportação</h2><p className="muted">Baixe os lançamentos do mês selecionado.</p><button className="btn btn-primary" onClick={exportCsv}>Exportar CSV</button></div>
    </section>
  );
}

function SimplePage({ title, text, action }) {
  return <section className="card"><h2>{title}</h2><p className="muted">{text}</p><button className="btn btn-primary" onClick={action}>Aplicar agora</button></section>;
}

function Skeleton() {
  return <div className="summary-grid">{Array.from({ length: 4 }).map((_, i) => <div className="card skeleton" key={i} />)}</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/*" element={<Protected><AppShell /></Protected>} />
    </Routes>
  );
}
