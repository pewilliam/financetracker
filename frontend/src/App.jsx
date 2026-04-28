import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
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
  listInvoices,
  setOpeningBalance,
  updatePassword,
  updateTransaction
} from "./api/api.js";
import { formatMoney, formatMonthLabel, parseMoneyInput } from "./utils/format.js";

function shiftMonth(year, month, delta) {
  const total = year * 12 + month - 1 + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
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
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ name: "", due_date: "", initial_amount: "" });

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

  async function refresh() {
    setLoading(true);
    try {
      const offsets = [-5, -4, -3, -2, -1, 0];
      const [monthPayload, summaryPayload, invoicesPayload, comparisonPayload] = await Promise.all([
        getMonth(year, month),
        getMonthSummary(year, month),
        listInvoices(),
        Promise.all(offsets.map(async (offset) => {
          const target = shiftMonth(year, month, offset);
          const data = await getMonthSummary(target.year, target.month);
          return { label: formatMonthLabel(target.year, target.month).slice(0, 3), ...data };
        }))
      ]);
      setMonthData(monthPayload);
      setSummary(summaryPayload);
      setInvoices(invoicesPayload);
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
        let recurrenceId = payload.data.recurrence_id;
        if (payload.recurrence?.enabled) {
          const recurrence = await createRecurrence({
            description: payload.data.description || "Recorrência",
            type: payload.data.type,
            amount: payload.data.amount,
            day_of_month: payload.recurrence.day_of_month,
            active: true
          });
          recurrenceId = recurrence.id;
        }
        await createTransaction({ ...payload.data, recurrence_id: recurrenceId });
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
      await createInvoice({
        name: invoiceForm.name,
        due_date: invoiceForm.due_date,
        initial_amount: parseMoneyInput(invoiceForm.initial_amount)
      });
      setInvoiceForm({ name: "", due_date: "", initial_amount: "" });
      setInvoiceModal(false);
      toast.success("Fatura criada");
      await refresh();
    } catch {
      toast.error("Erro ao criar fatura");
    }
  };

  const addItem = async (invoiceId, payload) => {
    await addInvoiceItem(invoiceId, payload);
    toast.success("Item adicionado");
    await refresh();
  };

  const deleteItem = async (invoiceId, itemId) => {
    await deleteInvoiceItem(invoiceId, itemId);
    toast.success("Item removido");
    await refresh();
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
              <Route path="/meses" element={<MonthsPage monthData={monthData} summary={summary} openAddForm={openAddForm} setEditing={setEditing} setDrawerOpen={setDrawerOpen} removeTransaction={removeTransaction} applyMonthRecurrences={applyMonthRecurrences} />} />
              <Route path="/faturas" element={<InvoicesPage invoices={invoices} addItem={addItem} deleteItem={deleteItem} openModal={() => setInvoiceModal(true)} />} />
              <Route path="/recorrencias" element={<SimplePage title="Recorrências" text="Use o drawer de lançamento para marcar itens recorrentes e aplique-os ao mês atual quando precisar." action={applyMonthRecurrences} />} />
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

function MonthsPage({ monthData, summary, openAddForm, setEditing, setDrawerOpen, removeTransaction, applyMonthRecurrences }) {
  return (
    <section className="card">
      <div className="section-head">
        <div><p className="eyebrow">Saldo inicial {formatMoney(monthData.opening_balance)}</p><h2>Tabela mensal</h2></div>
        <button className="btn" onClick={applyMonthRecurrences}>Aplicar recorrências</button>
      </div>
      <MonthlyTable days={monthData.days} summary={summary} onAdd={openAddForm} onEdit={(tx) => { setEditing(tx); setDrawerOpen(true); }} onDelete={removeTransaction} />
    </section>
  );
}

function InvoicesPage({ invoices, addItem, deleteItem, openModal }) {
  return (
    <section>
      <div className="section-head"><div><p className="eyebrow">Faturas futuras</p><h2>Faturas</h2></div></div>
      {invoices.length ? <div className="invoice-grid">{invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} onAddItem={addItem} onDeleteItem={deleteItem} />)}</div> : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhuma fatura cadastrada.</h3><p>Clique em + para criar.</p></div>}
      <button className="fab" onClick={openModal} aria-label="Criar fatura"><Plus /></button>
    </section>
  );
}

function InvoiceModal({ form, setForm, onSubmit, onClose }) {
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="modal-card form-stack" onSubmit={onSubmit}>
        <div className="drawer-head"><h2>Nova fatura</h2><button className="icon-btn" type="button" onClick={onClose}><X size={18} /></button></div>
        <label><span>Nome</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label><span>Data de vencimento</span><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>
        <label><span>Valor inicial</span><input inputMode="numeric" placeholder="R$ 0,00" value={form.initial_amount} onChange={(event) => setForm({ ...form, initial_amount: event.target.value })} /></label>
        <button className="btn btn-primary">Criar fatura</button>
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
