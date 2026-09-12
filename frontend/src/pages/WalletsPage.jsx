import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Banknote, Building2, ChevronLeft, ChevronRight, CircleDollarSign, Edit3, Landmark, Loader2, Plus, RotateCcw, SlidersHorizontal, TrendingUp, WalletCards, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { adjustWalletBalance, archiveWallet, createWallet, getWallet, getWalletMovements, listWallets, restoreWallet, transferBetweenWallets, updateWallet } from "../api/api.js";
import DateField from "../components/DateField.jsx";
import CategorySelect from "../components/CategorySelect.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

const WALLET_TYPES = [
  ["checking", "Conta corrente"],
  ["digital", "Conta digital"],
  ["cash", "Dinheiro"],
  ["reserve", "Reserva / Caixinha"],
  ["investment", "Investimento"],
  ["other", "Outros"]
];

const WALLET_TYPE_OPTIONS = WALLET_TYPES.map(([id, name], index) => ({
  id,
  name,
  color: ["#14A078", "#2F80ED", "#D49A17", "#8B5CF6", "#0EA5E9", "#64748B"][index],
}));

const TYPE_ICONS = { checking: Landmark, digital: Building2, cash: Banknote, reserve: CircleDollarSign, investment: TrendingUp, other: WalletCards };
const HISTORY_PAGE_SIZE = 8;

function todayIso() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function currentHistoryPeriod() {
  const value = new Date();
  return { year: value.getFullYear(), month: value.getMonth() + 1 };
}

function emptyWallet() {
  return { name: "", institution: "", type: "checking", initial_balance: "", tracking_started_on: todayIso(), color: "#14A078" };
}

function WalletEditor({ wallet, language, onClose, onSaved }) {
  const editing = Boolean(wallet?.id);
  const [form, setForm] = useState(editing ? {
    name: wallet.name,
    institution: wallet.institution || "",
    type: wallet.type,
    initial_balance: formatMoney(wallet.initial_balance, language),
    tracking_started_on: wallet.tracking_started_on,
    color: wallet.color || "#14A078"
  } : emptyWallet());
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        type: form.type,
        tracking_started_on: form.tracking_started_on,
        color: form.color
      };
      if (editing) await updateWallet(wallet.id, payload);
      else await createWallet({ ...payload, initial_balance: parseTypedMoneyInput(form.initial_balance, language) });
      toast.success(editing ? "Carteira atualizada" : "Carteira criada");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error.message === "Tracking date cannot be changed after movements exist" ? "A data de início não pode mudar depois que há movimentações" : "Não foi possível salvar a carteira");
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-layer">
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
    <form className="modal-card wallet-modal" onSubmit={submit}>
      <div className="modal-titlebar"><h2>{editing ? "Editar carteira" : "Nova carteira"}</h2><button className="icon-btn" type="button" onClick={onClose}><X size={18} /></button></div>
      <div className="wallet-modal-body form-stack">
        <label><span>Nome da carteira</span><input maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex: Conta principal" required autoFocus /></label>
        <label><span>Instituição <small>(opcional)</small></span><input maxLength="100" value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} placeholder="Ex: Nubank" /></label>
        <label><span>Tipo</span><CategorySelect categories={WALLET_TYPE_OPTIONS} value={form.type} onChange={(type) => setForm({ ...form, type })} multiple={false} clearable={false} placeholder="Selecione o tipo" searchPlaceholder="Buscar tipo..." ariaLabel="Tipos de carteira" className="wallet-type-select" /></label>
        {!editing && <label><span>Saldo inicial</span><input inputMode="decimal" value={form.initial_balance} onChange={(event) => setForm({ ...form, initial_balance: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={() => setForm({ ...form, initial_balance: formatTypedMoneyAsCurrency(form.initial_balance, language) })} placeholder={formatMoney(0, language)} /></label>}
        {editing && <p className="wallet-form-note">O saldo inicial não é sobrescrito. Use “Ajustar saldo” para manter a alteração registrada no histórico.</p>}
        <label><span>Início do acompanhamento</span><DateField value={form.tracking_started_on} onChange={(value) => setForm({ ...form, tracking_started_on: value })} /></label>
        <label className="wallet-color-field"><span>Cor</span><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
        <div className="wallet-modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 className="spin" size={16} /> Salvando</> : "Salvar carteira"}</button></div>
      </div>
    </form>
  </div>;
}

function BalanceAdjustment({ wallet, language, onClose, onSaved }) {
  const [form, setForm] = useState({ actual_balance: "", date: todayIso(), description: "" });
  const [busy, setBusy] = useState(false);
  const actual = parseTypedMoneyInput(form.actual_balance, language);
  const difference = actual - Number(wallet.current_balance || 0);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await adjustWalletBalance(wallet.id, { actual_balance: actual, date: form.date, description: form.description.trim() || null });
      toast.success("Ajuste registrado no histórico"); await onSaved(wallet.id); onClose();
    } catch (error) { toast.error(error.message === "Balance is already equal to the informed amount" ? "O saldo informado já é o saldo calculado" : "Não foi possível ajustar o saldo"); }
    finally { setBusy(false); }
  };
  return <div className="modal-layer"><button className="modal-backdrop" onClick={onClose} /><form className="modal-card wallet-modal" onSubmit={submit}>
    <div className="modal-titlebar"><h2>Ajustar saldo</h2><button className="icon-btn" type="button" onClick={onClose}><X size={18} /></button></div>
    <div className="wallet-modal-body form-stack">
      <div className="wallet-calculated-balance"><span>Saldo calculado</span><strong>{formatMoney(wallet.current_balance, language)}</strong></div>
      <label><span>Saldo real</span><input inputMode="decimal" value={form.actual_balance} onChange={(event) => setForm({ ...form, actual_balance: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={() => setForm({ ...form, actual_balance: formatTypedMoneyAsCurrency(form.actual_balance, language) })} required autoFocus /></label>
      {form.actual_balance && <div className={`wallet-adjustment-preview ${difference < 0 ? "negative" : "positive"}`}><span>Ajuste que será registrado</span><strong>{difference > 0 ? "+" : ""}{formatMoney(difference, language)}</strong></div>}
      <label><span>Data</span><DateField value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></label>
      <label><span>Observação <small>(opcional)</small></span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex: conciliação do extrato" /></label>
      <div className="wallet-modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || !form.actual_balance}>Registrar ajuste</button></div>
    </div>
  </form></div>;
}

function TransferEditor({ wallets, initialSource, language, onClose, onSaved }) {
  const active = wallets.filter((wallet) => wallet.active);
  const walletOptions = active.map((wallet) => ({ id: String(wallet.id), name: `${wallet.name}${wallet.institution ? ` · ${wallet.institution}` : ""}`, color: wallet.color }));
  const [form, setForm] = useState({ source_wallet_id: String(initialSource?.id || active[0]?.id || ""), destination_wallet_id: String(active.find((wallet) => wallet.id !== initialSource?.id)?.id || ""), amount: "", date: todayIso(), description: "" });
  const [busy, setBusy] = useState(false);
  const sourceWallet = active.find((wallet) => String(wallet.id) === form.source_wallet_id);
  const destinationWallet = active.find((wallet) => String(wallet.id) === form.destination_wallet_id);
  const transferAmount = parseTypedMoneyInput(form.amount, language);
  const sourceBalance = Number(sourceWallet?.current_balance || 0);
  const destinationBalance = Number(destinationWallet?.current_balance || 0);
  const useFullBalance = (event) => {
    event.preventDefault();
    if (sourceBalance <= 0) return;
    setForm((current) => ({ ...current, amount: formatMoney(sourceBalance, language) }));
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await transferBetweenWallets({ source_wallet_id: Number(form.source_wallet_id), destination_wallet_id: Number(form.destination_wallet_id), amount: parseTypedMoneyInput(form.amount, language), date: form.date, description: form.description.trim() || null });
      toast.success("Transferência realizada sem alterar o patrimônio"); await onSaved(Number(form.source_wallet_id)); onClose();
    } catch (error) { toast.error(error.message === "Choose two different wallets" ? "Escolha carteiras diferentes" : "Não foi possível realizar a transferência"); }
    finally { setBusy(false); }
  };
  return <div className="modal-layer"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar" /><form className="modal-card wallet-modal wallet-transfer-modal" onSubmit={submit}>
    <div className="wallet-transfer-header"><i><ArrowRightLeft size={20} /></i><div><small>TRANSFERÊNCIA INTERNA</small><h2>Transferir entre carteiras</h2><p>Mova seu dinheiro sem alterar o patrimônio total.</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
    <div className="wallet-modal-body form-stack">
      <div className="wallet-transfer-route">
        <label><span>Carteira de origem</span><CategorySelect categories={walletOptions} value={form.source_wallet_id} onChange={(sourceId) => setForm((current) => ({ ...current, source_wallet_id: sourceId, destination_wallet_id: current.destination_wallet_id === sourceId ? String(active.find((wallet) => String(wallet.id) !== sourceId)?.id || "") : current.destination_wallet_id }))} multiple={false} clearable={false} placeholder="Selecione a origem" searchPlaceholder="Buscar carteira..." ariaLabel="Carteiras de origem" /></label>
        <span className="wallet-transfer-direction" aria-hidden="true"><ArrowRightLeft size={16} /></span>
        <label><span>Carteira de destino</span><CategorySelect categories={walletOptions.filter((wallet) => wallet.id !== form.source_wallet_id)} value={form.destination_wallet_id} onChange={(destinationId) => setForm((current) => ({ ...current, destination_wallet_id: destinationId }))} multiple={false} clearable={false} placeholder="Selecione o destino" searchPlaceholder="Buscar carteira..." ariaLabel="Carteiras de destino" /></label>
      </div>
      <div className="wallet-transfer-details"><label><span className="wallet-transfer-value-label"><span>Valor</span><button type="button" onClick={useFullBalance} disabled={!sourceWallet || sourceBalance <= 0 || busy}>Usar saldo total</button></span><input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: formatTypedMoneyForEditing(event.target.value, language) })} onBlur={() => setForm({ ...form, amount: formatTypedMoneyAsCurrency(form.amount, language) })} placeholder={formatMoney(0, language)} required /></label><label><span>Data</span><DateField value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></label></div>
      <div className="wallet-transfer-preview" aria-live="polite">
        <section style={{ "--wallet-preview-color": sourceWallet?.color || "var(--primary)" }}><header><i /><div><small>Origem</small><strong>{sourceWallet?.name || "Selecione uma carteira"}</strong></div></header><div><span>Saldo atual <strong>{formatMoney(sourceBalance, language)}</strong></span><span>Saldo após <strong className={sourceBalance - transferAmount < 0 ? "negative" : ""}>{formatMoney(sourceBalance - transferAmount, language)}</strong></span></div></section>
        <section style={{ "--wallet-preview-color": destinationWallet?.color || "var(--primary)" }}><header><i /><div><small>Destino</small><strong>{destinationWallet?.name || "Selecione uma carteira"}</strong></div></header><div><span>Saldo atual <strong>{formatMoney(destinationBalance, language)}</strong></span><span>Saldo após <strong>{formatMoney(destinationBalance + transferAmount, language)}</strong></span></div></section>
      </div>
      <label><span>Observação <small>(opcional)</small></span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <p className="wallet-form-note">A saída e a entrada serão registradas nas duas carteiras. O patrimônio total permanece igual.</p>
      <div className="wallet-modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || active.length < 2}>Transferir</button></div>
    </div>
  </form></div>;
}

export default function WalletsPage({ summary: initialSummary, onChanged }) {
  const { language } = useI18n();
  const [summary, setSummary] = useState(initialSummary || { total_balance: 0, active_count: 0, wallets: [] });
  const [editor, setEditor] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailCloseTimer = useRef(null);
  const [historyPeriod, setHistoryPeriod] = useState(currentHistoryPeriod);
  const [history, setHistory] = useState({ items: [], page: 1, total: 0, total_pages: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef(0);
  const [showArchived, setShowArchived] = useState(false);
  const [organizeDismissed, setOrganizeDismissed] = useState(() => localStorage.getItem("wallet-organize-dismissed") === "1");

  useEffect(() => setSummary(initialSummary || { total_balance: 0, active_count: 0, wallets: [] }), [initialSummary]);
  useEffect(() => () => clearTimeout(detailCloseTimer.current), []);
  const wallets = summary.wallets || [];
  const visibleWallets = useMemo(() => wallets.filter((wallet) => wallet.active || showArchived), [wallets, showArchived]);
  const walletGroups = useMemo(() => {
    const groups = new Map();
    visibleWallets.forEach((wallet) => {
      const key = wallet.institution || "Sem instituição";
      groups.set(key, [...(groups.get(key) || []), wallet]);
    });
    return [...groups.entries()].sort(([left], [right]) => {
      if (left === "Sem instituição") return -1;
      if (right === "Sem instituição") return 1;
      return left.localeCompare(right, language);
    });
  }, [visibleWallets, language]);

  const loadHistory = async (walletId, period, page = 1, append = false) => {
    const requestId = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const next = await getWalletMovements(walletId, { ...period, page, pageSize: HISTORY_PAGE_SIZE });
      if (requestId === historyRequest.current) setHistory((current) => append ? { ...next, items: [...current.items, ...next.items] } : next);
    } catch {
      if (requestId === historyRequest.current) toast.error("Não foi possível carregar as movimentações da carteira");
    } finally {
      if (requestId === historyRequest.current) setHistoryLoading(false);
    }
  };
  const loadDetail = async (walletId) => {
    clearTimeout(detailCloseTimer.current);
    const period = currentHistoryPeriod();
    setDetailClosing(false); setSelectedId(walletId); setDetail(null); setDetailLoading(true);
    setHistoryPeriod(period); setHistory({ items: [], page: 1, total: 0, total_pages: 0 });
    void loadHistory(walletId, period, 1);
    try { setDetail(await getWallet(walletId)); } catch { toast.error("Não foi possível carregar os detalhes da carteira"); }
    finally { setDetailLoading(false); }
  };
  const closeDetail = () => {
    historyRequest.current += 1;
    setDetailClosing(true);
    clearTimeout(detailCloseTimer.current);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    detailCloseTimer.current = setTimeout(() => {
      setSelectedId(null);
      setDetail(null);
      setHistory({ items: [], page: 1, total: 0, total_pages: 0 });
      setDetailClosing(false);
    }, reducedMotion ? 0 : 420);
  };
  const refresh = async (detailId = selectedId) => {
    const next = await listWallets(); setSummary(next);
    if (detailId) {
      setDetailLoading(true);
      try { setDetail(await getWallet(detailId)); } finally { setDetailLoading(false); }
      await loadHistory(detailId, historyPeriod, 1);
    }
    await onChanged?.();
  };
  const shiftHistoryMonth = (offset) => {
    if (!selectedId || historyLoading) return;
    const value = new Date(historyPeriod.year, historyPeriod.month - 1 + offset, 1);
    const period = { year: value.getFullYear(), month: value.getMonth() + 1 };
    setHistoryPeriod(period);
    void loadHistory(selectedId, period, 1);
  };
  const toggleArchive = async (wallet) => {
    try {
      if (wallet.active) await archiveWallet(wallet.id); else await restoreWallet(wallet.id);
      toast.success(wallet.active ? "Carteira arquivada; o histórico foi preservado" : "Carteira reativada");
      if (wallet.id === selectedId && wallet.active) closeDetail();
      await refresh(wallet.active ? null : wallet.id);
    } catch (error) { toast.error(error.message === "Keep at least one active wallet" ? "Mantenha pelo menos uma carteira ativa" : error.message?.includes("balance to zero") ? "Transfira ou ajuste o saldo para zero antes de arquivar" : "Não foi possível alterar a carteira"); }
  };

  const historyMonthLabel = new Date(historyPeriod.year, historyPeriod.month - 1, 1).toLocaleDateString(language, { month: "long", year: "numeric" });
  const historyGroups = useMemo(() => {
    const groups = new Map();
    history.items.forEach((movement) => groups.set(movement.date, [...(groups.get(movement.date) || []), movement]));
    return [...groups.entries()];
  }, [history.items]);
  const selectedWallet = wallets.find((wallet) => wallet.id === selectedId);

  return <section className="wallets-page">
    <header className="card wallets-hero">
      <div><p className="eyebrow">ONDE ESTÁ SEU DINHEIRO</p><h1>Carteiras</h1><p>Contas, reservas e dinheiro em espécie reunidos sem misturar suas origens.</p></div>
      <div className="wallets-total"><span>Patrimônio total</span><strong>{formatMoney(summary.total_balance, language)}</strong><small>{summary.active_count} {summary.active_count === 1 ? "carteira ativa" : "carteiras ativas"}</small></div>
      <button className="btn btn-primary" type="button" onClick={() => setEditor({})}><Plus size={17} /> Nova carteira</button>
    </header>

    {summary.needs_organization && !organizeDismissed && <aside className="card wallet-onboarding-banner">
      <div><strong>Organize seu saldo</strong><p>Seu saldo está concentrado na Carteira principal. Você pode continuar assim ou criar suas contas e distribuir valores por transferência.</p></div>
      <div><button className="btn btn-primary" onClick={() => setEditor({})}>Organizar agora</button><button className="btn btn-ghost" onClick={() => { localStorage.setItem("wallet-organize-dismissed", "1"); setOrganizeDismissed(true); }}>Manter assim</button></div>
    </aside>}

    <div className="wallets-toolbar">
      <div><button className="btn btn-ghost" type="button" disabled={summary.active_count < 2} onClick={() => setTransferring(wallets.find((wallet) => wallet.active))}><ArrowRightLeft size={16} /> Transferir</button></div>
      {wallets.some((wallet) => !wallet.active) && <label className="wallet-archived-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Exibir arquivadas</label>}
    </div>

    <div className="wallets-layout">
      <div className="wallet-groups">
        {walletGroups.map(([institution, groupedWallets]) => <section className="wallet-group" key={institution}>
          <div className="wallet-group-heading">{institution === "Sem instituição" ? <WalletCards size={16} /> : <Building2 size={16} />}<h2>{institution}</h2><span>{groupedWallets.length}</span></div>
          <div className="wallet-card-grid">{groupedWallets.map((wallet) => {
          const Icon = TYPE_ICONS[wallet.type] || WalletCards;
          const trackingLabel = new Date(`${wallet.tracking_started_on}T12:00:00`).toLocaleDateString(language);
          return <article
            key={wallet.id}
            className={`card wallet-card ${selectedId === wallet.id ? "selected" : ""} ${!wallet.active ? "archived" : ""}`}
            style={{ "--wallet-color": wallet.color }}
            onClick={() => loadDetail(wallet.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); loadDetail(wallet.id); } }}
            role="button"
            tabIndex={0}
            aria-label={`Abrir detalhes de ${wallet.name}`}
          >
            <div className="wallet-card-heading">
              <i><Icon size={18} /></i>
              <div><small>{wallet.institution || WALLET_TYPES.find(([value]) => value === wallet.type)?.[1]}</small><h3>{wallet.name}</h3></div>
              {!wallet.active && <span className="wallet-status">Arquivada</span>}
            </div>
            <div className="wallet-card-balance"><span>Saldo atual</span><strong>{formatMoney(wallet.current_balance, language)}</strong></div>
            <div className="wallet-card-flow">
              <small>Desde {trackingLabel}</small>
              <div><span><ArrowDownLeft size={13} /> Entradas <strong>{formatMoney(wallet.total_income, language)}</strong></span><span><ArrowUpRight size={13} /> Saídas <strong>{formatMoney(wallet.total_expenses, language)}</strong></span></div>
            </div>
          </article>;
          })}</div>
        </section>)}
      </div>

      {(selectedId || detailLoading) && <aside className={`card wallet-detail ${detailClosing ? "closing" : ""}`} key={selectedId || "wallet-detail"} style={{ "--wallet-color": detail?.color || selectedWallet?.color || "var(--primary)" }}>
        {detailLoading && !detail ? <div className="wallet-detail-loading"><Loader2 className="spin" /> Carregando histórico...</div> : detail && <>
          <div className="wallet-detail-head"><div><small>{detail.institution || "Carteira"}</small><h2>{detail.name}</h2></div><button className="icon-btn" onClick={closeDetail} aria-label="Fechar detalhes"><X size={18} /></button></div>
          <div className="wallet-detail-stats"><div><span>Saldo atual</span><strong>{formatMoney(detail.current_balance, language)}</strong></div><div><span>Entradas · desde o início</span><strong className="money-income">{formatMoney(detail.total_income, language)}</strong></div><div><span>Saídas · desde o início</span><strong className="money-expense">{formatMoney(detail.total_expenses, language)}</strong></div></div>
          <div className="wallet-detail-actions">
            {detail.active && <button className="btn btn-ghost" type="button" onClick={() => setAdjusting(detail)}><SlidersHorizontal size={15} /> Ajustar saldo</button>}
            <button className="btn btn-ghost" type="button" onClick={() => setEditor(detail)}><Edit3 size={15} /> Editar</button>
            <button className="btn btn-ghost" type="button" onClick={() => toggleArchive(detail)}>{detail.active ? <Archive size={15} /> : <RotateCcw size={15} />}{detail.active ? "Arquivar" : "Reativar"}</button>
          </div>
          <p className="wallet-tracking-note">Saldo inicial em {new Date(`${detail.tracking_started_on}T12:00:00`).toLocaleDateString(language)}: <strong>{formatMoney(detail.initial_balance, language)}</strong></p>
          <div className="wallet-history-heading">
            <div><h3>Histórico da carteira</h3>{history.total > 0 && <small>{history.total} {history.total === 1 ? "movimentação" : "movimentações"}</small>}</div>
            <div className="wallet-history-period" aria-label="Período do histórico"><button type="button" onClick={() => shiftHistoryMonth(-1)} disabled={historyLoading} aria-label="Mês anterior"><ChevronLeft size={16} /></button><div><small>Período</small><strong>{historyMonthLabel}</strong></div><button type="button" onClick={() => shiftHistoryMonth(1)} disabled={historyLoading} aria-label="Próximo mês"><ChevronRight size={16} /></button></div>
          </div>
          <div className={`wallet-history-results ${historyLoading ? "is-loading" : ""}`}>
          {historyLoading && !history.items.length ? <div className="wallet-history-state"><Loader2 className="spin" size={18} /> Carregando movimentações...</div> : history.items.length > 0 ? <>
            <div className="wallet-movement-list">{historyGroups.map(([movementDate, movements]) => <section className="wallet-movement-day" key={movementDate}>
              <h4>{new Date(`${movementDate}T12:00:00`).toLocaleDateString(language, { day: "2-digit", month: "long", year: "numeric" })}</h4>
              {movements.map((movement) => {
                const MovementIcon = movement.kind.startsWith("transfer") ? ArrowRightLeft : movement.kind === "adjustment" ? SlidersHorizontal : movement.kind === "initial_balance" ? WalletCards : Number(movement.amount) >= 0 ? ArrowDownLeft : ArrowUpRight;
                const movementKind = movement.kind.startsWith("transfer") ? "Transferência" : movement.kind === "adjustment" ? "Ajuste de saldo" : movement.kind === "initial_balance" ? "Início do acompanhamento" : Number(movement.amount) >= 0 ? "Entrada" : "Saída";
                return <div className="wallet-movement" key={`${movement.kind}-${movement.id}-${movement.date}`}>
                  <i className={Number(movement.amount) >= 0 ? "positive" : "negative"}><MovementIcon size={15} /></i>
                  <div><strong>{movement.description || "Movimentação"}</strong><small>{movementKind}{movement.counterpart_wallet_name ? ` · ${movement.counterpart_wallet_name}` : ""}</small></div>
                  <strong className={Number(movement.amount) >= 0 ? "money-income" : "money-expense"}>{Number(movement.amount) > 0 ? "+" : ""}{formatMoney(movement.amount, language)}</strong>
                </div>;
              })}
            </section>)}</div>
            {history.page < history.total_pages && <div className="wallet-history-more"><button type="button" disabled={historyLoading} onClick={() => loadHistory(selectedId, historyPeriod, history.page + 1, true)}>{historyLoading ? <><Loader2 className="spin" size={15} /> Carregando...</> : "Carregar mais movimentações"}</button><small>{history.items.length} de {history.total}</small></div>}
          </> : <div className="wallet-history-state">Nenhuma movimentação em {historyMonthLabel}.</div>}
          </div>
        </>}
      </aside>}
    </div>

    {editor && <WalletEditor wallet={editor.id ? editor : null} language={language} onClose={() => setEditor(null)} onSaved={refresh} />}
    {adjusting && <BalanceAdjustment wallet={adjusting} language={language} onClose={() => setAdjusting(null)} onSaved={refresh} />}
    {transferring && <TransferEditor wallets={wallets} initialSource={transferring} language={language} onClose={() => setTransferring(null)} onSaved={refresh} />}
  </section>;
}
