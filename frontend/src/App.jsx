import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CreditCard,
  Grid2X2,
  List,
  LogOut,
  Menu,
  Moon,
  Plus,
  Repeat,
  Settings,
  Sun,
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
  createInvoice,
  createRecurrence,
  createTransaction,
  deleteInvoiceItem,
  deleteTransaction,
  getMonth,
  getMonthSummary,
  getMonthsSummary,
  listInvoices,
  setInvoicePaid,
  setOpeningBalance,
  updatePassword,
  updateTransaction
} from "./api/api.js";
import { formatDateShort, formatMoney, formatMonthLabel, parseMoneyInput } from "./utils/format.js";

function shiftMonth(year, month, delta) {
  const total = year * 12 + month - 1 + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function formatMoneyForInput(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ name: "", due_date: "", initial_amount: "", duplicate_next_month: false, duplicate_months: 1 });

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

  async function refresh() {
    setLoading(true);
    try {
      const offsets = [-5, -4, -3, -2, -1, 0];
      const [monthPayload, summaryPayload, invoicesPayload, monthCardsPayload, comparisonPayload] = await Promise.all([
        getMonth(year, month),
        getMonthSummary(year, month),
        listInvoices(),
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

  const createNewInvoice = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        name: invoiceForm.name,
        due_date: invoiceForm.due_date,
        initial_amount: parseMoneyInput(invoiceForm.initial_amount)
      };
      await createInvoice(payload);
      if (invoiceForm.duplicate_next_month) {
        const months = Math.max(1, Number(invoiceForm.duplicate_months) || 1);
        await Promise.all(Array.from({ length: months }, (_, index) => (
          createInvoice({
            ...payload,
            due_date: addMonthsToDate(payload.due_date, index + 1)
          })
        )));
      }
      setInvoiceForm({ name: "", due_date: "", initial_amount: "", duplicate_next_month: false, duplicate_months: 1 });
      setInvoiceModal(false);
      toast.success(invoiceForm.duplicate_next_month ? "Faturas criadas" : "Fatura criada");
      await refresh();
    } catch {
      toast.error("Erro ao criar fatura");
    }
  };

  const openNewInvoiceModal = () => {
    setInvoiceForm({ name: "", due_date: "", initial_amount: "", duplicate_next_month: false, duplicate_months: 1 });
    setInvoiceModal(true);
  };

  const openDuplicateInvoiceModal = (invoice) => {
    setInvoiceForm({
      name: invoice.name,
      due_date: nextMonthDate(invoice.due_date),
      initial_amount: formatMoneyForInput(invoice.total_amount),
      duplicate_next_month: false,
      duplicate_months: 1
    });
    setInvoiceModal(true);
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
              <Route path="/faturas" element={<InvoicesPage invoices={invoices} addItem={addItem} deleteItem={deleteItem} togglePaid={toggleInvoicePaid} openModal={openNewInvoiceModal} openDuplicateInvoiceModal={openDuplicateInvoiceModal} />} />
              <Route path="/recorrencias" element={<SimplePage title="Recorrências" text="As recorrências agora são criadas automaticamente pelo período informado no lançamento. Este botão permanece para recorrências antigas." action={applyMonthRecurrences} />} />
              <Route path="/configuracoes" element={<SettingsPage summary={summary} monthLabel={formatMonthLabel(year, month)} monthData={monthData} year={year} month={month} refresh={refresh} />} />
            </Routes>
          )}
        </div>
      </main>

      <TransactionForm open={drawerOpen} initial={editing} date={selectedDate} invoices={invoices} onClose={() => setDrawerOpen(false)} onSave={saveTransaction} />
      {invoiceModal && <InvoiceModal form={invoiceForm} setForm={setInvoiceForm} onSubmit={createNewInvoice} onClose={() => setInvoiceModal(false)} />}
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

function InvoicesPage({ invoices, addItem, deleteItem, togglePaid, openModal, openDuplicateInvoiceModal }) {
  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">Faturas futuras</p><h2>Faturas</h2></div>
        <button className="btn btn-primary" onClick={openModal}><Plus size={16} /> Nova fatura</button>
      </div>
      {invoices.length ? <div className="invoice-grid">{invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} onAddItem={addItem} onDeleteItem={deleteItem} onTogglePaid={togglePaid} onDuplicateNext={openDuplicateInvoiceModal} />)}</div> : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura cadastrada.</h3><p>Clique em Nova fatura para criar.</p></div>}
      <button className="fab" onClick={openModal} aria-label="Criar fatura"><Plus /></button>
    </section>
  );
}

function InvoiceModal({ form, setForm, onSubmit, onClose }) {
  const nextDueDate = form.due_date ? nextMonthDate(form.due_date) : "";
  const duplicateMonths = Math.max(1, Number(form.duplicate_months) || 1);
  const lastDuplicateDate = form.due_date ? addMonthsToDate(form.due_date, duplicateMonths) : "";

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="modal-card invoice-modal" onSubmit={onSubmit}>
        <div className="modal-titlebar">
          <div className="modal-icon"><CreditCard size={22} /></div>
          <div>
            <p className="eyebrow">Cadastro de fatura</p>
            <h2>Nova fatura</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>

        <div className="invoice-modal-body">
          <label><span>Nome</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <div className="invoice-modal-grid">
            <label><span>Data de vencimento</span><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>
            <label><span>Valor inicial</span><input inputMode="numeric" placeholder="R$ 0,00" value={form.initial_amount} onChange={(event) => setForm({ ...form, initial_amount: event.target.value })} /></label>
          </div>

          <label className={`duplicate-option ${form.duplicate_next_month ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={form.duplicate_next_month}
              onChange={(event) => setForm({ ...form, duplicate_next_month: event.target.checked })}
            />
            <span className="duplicate-icon"><CalendarPlus size={20} /></span>
            <span>
              <strong>Duplicar para o próximo mês</strong>
              <small>
                {nextDueDate
                  ? `Também cria faturas futuras a partir de ${formatDateShort(nextDueDate)}.`
                  : "Ao informar o vencimento, a próxima data será calculada automaticamente."}
              </small>
            </span>
          </label>

          {form.duplicate_next_month && (
            <div className="duplicate-months-row">
              <label>
                <span>Meses seguintes</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={form.duplicate_months}
                  onChange={(event) => setForm({ ...form, duplicate_months: event.target.value })}
                />
              </label>
              <div className="duplicate-preview">
                <strong>{duplicateMonths + 1} faturas no total</strong>
                <span>
                  {lastDuplicateDate
                    ? `Última em ${formatDateShort(lastDuplicateDate)}`
                    : "Informe a data de vencimento"}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary">{form.duplicate_next_month ? "Criar faturas" : "Criar fatura"}</button>
        </div>
      </form>
    </div>
  );
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
