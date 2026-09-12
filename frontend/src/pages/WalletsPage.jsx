import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Banknote, Building2, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Edit3, Landmark, Loader2, MoveRight, Plus, ReceiptText, RotateCcw, SlidersHorizontal, Star, TrendingUp, WalletCards, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { adjustWalletBalance, archiveWallet, consolidateWallet, createWallet, getWallet, getWalletMovements, listWallets, previewWalletConsolidation, restoreWallet, setPrimaryWallet, transferBetweenWallets, updateWallet } from "../api/api.js";
import DateField from "../components/DateField.jsx";
import CategorySelect from "../components/CategorySelect.jsx";
import WalletSelect from "../components/WalletSelect.jsx";
import { MOBILE_MEDIA_QUERY } from "../app/constants.js";
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
  const shouldAutoFocusName = !window.matchMedia(MOBILE_MEDIA_QUERY).matches;
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

  return <div className="modal-layer wallet-modal-layer">
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
    <form className="modal-card wallet-modal wallet-editor-modal" onSubmit={submit}>
      <div className="wallet-transfer-header"><i><WalletCards size={20} /></i><div><small>{editing ? "CONFIGURAÇÃO DA CARTEIRA" : "NOVA CARTEIRA"}</small><h2>{editing ? "Editar carteira" : "Criar carteira"}</h2><p>{editing ? "Atualize a identificação e a aparência da carteira." : "Cadastre onde você mantém seu dinheiro."}</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <div className="wallet-modal-body form-stack">
        <label><span>Nome da carteira</span><input maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex: Conta principal" required autoFocus={shouldAutoFocusName} /></label>
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
  return <div className="modal-layer wallet-modal-layer"><button className="modal-backdrop" onClick={onClose} /><form className="modal-card wallet-modal" onSubmit={submit}>
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
  const defaultSource = initialSource || active.find((wallet) => wallet.is_primary) || active[0];
  const [form, setForm] = useState({ source_wallet_id: String(defaultSource?.id || ""), destination_wallet_id: String(active.find((wallet) => wallet.id !== defaultSource?.id)?.id || ""), amount: "", date: todayIso(), description: "" });
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
  return <div className="modal-layer wallet-modal-layer"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar" /><form className="modal-card wallet-modal wallet-transfer-modal" onSubmit={submit}>
    <div className="wallet-transfer-header"><i><ArrowRightLeft size={20} /></i><div><small>TRANSFERÊNCIA INTERNA</small><h2>Transferir entre carteiras</h2><p>Mova seu dinheiro sem alterar o patrimônio total.</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
    <div className="wallet-modal-body form-stack">
      <div className="wallet-transfer-route">
        <label><span>Carteira de origem</span><WalletSelect wallets={active} value={form.source_wallet_id} onChange={(sourceId) => setForm((current) => ({ ...current, source_wallet_id: sourceId, destination_wallet_id: current.destination_wallet_id === sourceId ? String(active.find((wallet) => String(wallet.id) !== sourceId)?.id || "") : current.destination_wallet_id }))} placeholder="Selecione a origem" ariaLabel="Carteiras de origem" /></label>
        <span className="wallet-transfer-direction" aria-hidden="true"><ArrowRightLeft size={16} /></span>
        <label><span>Carteira de destino</span><WalletSelect wallets={active.filter((wallet) => String(wallet.id) !== form.source_wallet_id)} value={form.destination_wallet_id} onChange={(destinationId) => setForm((current) => ({ ...current, destination_wallet_id: destinationId }))} placeholder="Selecione o destino" ariaLabel="Carteiras de destino" /></label>
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

function ConsolidationEditor({ wallets, initialSource, language, onClose, onSaved }) {
  const active = wallets.filter((wallet) => wallet.active);
  const initialSourceId = String(initialSource?.id || active[0]?.id || "");
  const [form, setForm] = useState({
    source_wallet_id: initialSourceId,
    destination_wallet_id: String(active.find((wallet) => String(wallet.id) !== initialSourceId)?.id || ""),
    adjust_tracking_start: true,
  });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!form.source_wallet_id || !form.destination_wallet_id) return undefined;
    let cancelled = false;
    setLoading(true);
    previewWalletConsolidation({
      ...form,
      source_wallet_id: Number(form.source_wallet_id),
      destination_wallet_id: Number(form.destination_wallet_id),
    }).then((result) => { if (!cancelled) setPreview(result); })
      .catch(() => { if (!cancelled) { setPreview(null); toast.error("Não foi possível calcular a reorganização"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [form]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await consolidateWallet({
        ...form,
        source_wallet_id: Number(form.source_wallet_id),
        destination_wallet_id: Number(form.destination_wallet_id),
      });
      toast.success(`${result.moved_transaction_count} ${result.moved_transaction_count === 1 ? "lançamento consolidado" : "lançamentos consolidados"} com sucesso`);
      await onSaved(Number(form.source_wallet_id));
      onClose();
    } catch (error) {
      toast.error(error.message === "No wallet history to consolidate" ? "Não há histórico nessa carteira" : error.message === "Wallet consolidation would change total balance" ? "Não foi possível preservar o patrimônio com essas datas de acompanhamento" : "Não foi possível consolidar a carteira");
    } finally {
      setBusy(false);
    }
  };

  const source = active.find((wallet) => String(wallet.id) === form.source_wallet_id);
  const destination = active.find((wallet) => String(wallet.id) === form.destination_wallet_id);
  const preservesTotal = preview && Number(preview.total_balance_before) === Number(preview.total_balance_after);
  const includesFutureTransactions = preview?.latest_date && preview.latest_date > todayIso();
  const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(language) : "—";

  return <div className="modal-layer wallet-modal-layer"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar" /><form className="modal-card wallet-modal wallet-transfer-modal wallet-consolidation-modal" onSubmit={submit}>
    <div className="wallet-transfer-header"><i><ReceiptText size={20} /></i><div><small>CONSOLIDAÇÃO DE CARTEIRA</small><h2>Mover todo o histórico</h2><p>Reúna saldo inicial, ganhos, gastos e lançamentos futuros em uma só carteira.</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
    <div className="wallet-modal-body form-stack">
      <div className="wallet-transfer-route">
        <label><span>Carteira que será esvaziada</span><WalletSelect wallets={active.filter((wallet) => String(wallet.id) !== form.destination_wallet_id)} value={form.source_wallet_id} onChange={(sourceId) => setForm((current) => ({ ...current, source_wallet_id: sourceId, destination_wallet_id: current.destination_wallet_id === sourceId ? String(active.find((wallet) => String(wallet.id) !== sourceId)?.id || "") : current.destination_wallet_id }))} ariaLabel="Carteiras de origem" /></label>
        <span className="wallet-transfer-direction" aria-hidden="true"><MoveRight size={17} /></span>
        <label><span>Carteira que receberá tudo</span><WalletSelect wallets={active.filter((wallet) => String(wallet.id) !== form.source_wallet_id)} value={form.destination_wallet_id} onChange={(destinationId) => setForm((current) => ({ ...current, destination_wallet_id: destinationId }))} ariaLabel="Carteiras de destino" /></label>
      </div>

      {loading ? <div className="wallet-consolidation-loading"><Loader2 className="spin" size={17} /> Calculando impacto...</div> : preview && <>
        <div className="wallet-consolidation-summary">
          <div><strong>{preview.transaction_count}</strong><span>{preview.transaction_count === 1 ? "lançamento" : "lançamentos"}{includesFutureTransactions ? " · inclui futuros" : ""}</span></div>
          <div><strong className="money-income">+{formatMoney(preview.income_total, language)}</strong><span>{preview.income_count} {preview.income_count === 1 ? "ganho" : "ganhos"}</span></div>
          <div><strong className="money-expense">-{formatMoney(preview.expense_total, language)}</strong><span>{preview.expense_count} {preview.expense_count === 1 ? "gasto" : "gastos"}</span></div>
          <small>{formatDate(preview.earliest_date)} até {formatDate(preview.latest_date)}</small>
        </div>
        <div className="wallet-transfer-preview">
          <section style={{ "--wallet-preview-color": source?.color || "var(--primary)" }}><header><i /><div><small>Origem</small><strong>{source?.name}</strong></div></header><div><span>Saldo atual <strong>{formatMoney(preview.source_balance_before, language)}</strong></span><span>Saldo após <strong>{formatMoney(preview.source_balance_after, language)}</strong></span></div></section>
          <section style={{ "--wallet-preview-color": destination?.color || "var(--primary)" }}><header><i /><div><small>Destino</small><strong>{destination?.name}</strong></div></header><div><span>Saldo atual <strong>{formatMoney(preview.destination_balance_before, language)}</strong></span><span>Saldo após <strong className={Number(preview.destination_balance_after) < 0 ? "negative" : ""}>{formatMoney(preview.destination_balance_after, language)}</strong></span></div></section>
        </div>
        {preview.direct_transfer_count > 0 && <p className="wallet-consolidation-transfer-note"><ArrowRightLeft size={15} /><span><strong>{preview.direct_transfer_count} {preview.direct_transfer_count === 1 ? "transferência direta será desfeita" : "transferências diretas serão desfeitas"}</strong><small>{formatMoney(preview.direct_transfer_total, language)} entre estas duas carteiras. Transferências com outras carteiras apenas trocarão a origem ou o destino.</small></span></p>}
        {preview.tracking_start_changes && <p className="wallet-consolidation-tracking-note">O início do acompanhamento de <strong>{destination?.name}</strong> será antecipado de {formatDate(preview.tracking_start_before)} para {formatDate(preview.tracking_start_after)}, incluindo todo o período da carteira de origem.</p>}
        {preview.destination_becomes_primary && <p className="wallet-consolidation-primary-note"><Star size={15} /><span><strong>{destination?.name} passará a ser a carteira principal</strong><small>Novos lançamentos e faturas começarão selecionados nela.</small></span></p>}
        {!preservesTotal && <p className="wallet-consolidation-warning">A operação foi bloqueada porque alteraria o patrimônio total. Ajuste as datas de acompanhamento antes de continuar.</p>}
        <p className="wallet-consolidation-recurrences"><strong>{preview.recurrence_count} {preview.recurrence_count === 1 ? "recorrência será movida" : "recorrências serão movidas"}</strong><span>{preview.income_recurrence_count} de ganhos e {preview.expense_recurrence_count} de gastos; os próximos lançamentos usarão a carteira de destino.</span></p>
      </>}

      <p className="wallet-form-note">Datas, valores, categorias, vínculos e recorrências serão preservados. A carteira de origem ficará zerada e poderá ser arquivada depois.</p>
      <div className="wallet-modal-actions"><button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || loading || !preview || !preservesTotal}>{busy ? <><Loader2 className="spin" size={16} /> Consolidando...</> : "Consolidar carteira"}</button></div>
    </div>
  </form></div>;
}

export default function WalletsPage({ summary: initialSummary, onChanged, onOverlayChange }) {
  const { language } = useI18n();
  const [summary, setSummary] = useState(initialSummary || { total_balance: 0, active_count: 0, wallets: [] });
  const [editor, setEditor] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [consolidating, setConsolidating] = useState(null);
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
  const [mobileDetail, setMobileDetail] = useState(() => window.matchMedia(MOBILE_MEDIA_QUERY).matches);
  const modalOpen = Boolean(editor || adjusting || transferring || consolidating);
  const overlayOpen = modalOpen || (mobileDetail && Boolean(selectedId || detailLoading));

  useEffect(() => setSummary(initialSummary || { total_balance: 0, active_count: 0, wallets: [] }), [initialSummary]);
  useEffect(() => () => clearTimeout(detailCloseTimer.current), []);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateMobileDetail = () => setMobileDetail(media.matches);
    updateMobileDetail();
    media.addEventListener("change", updateMobileDetail);
    return () => media.removeEventListener("change", updateMobileDetail);
  }, []);
  useEffect(() => {
    onOverlayChange?.(overlayOpen);
    return () => onOverlayChange?.(false);
  }, [onOverlayChange, overlayOpen]);
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
    } catch (error) { toast.error(error.message === "Keep at least one active wallet" ? "Mantenha pelo menos uma carteira ativa" : error.message === "Choose another primary wallet before archiving" ? "Defina outra carteira como principal antes de arquivar esta" : error.message?.includes("balance to zero") ? "Transfira ou ajuste o saldo para zero antes de arquivar" : "Não foi possível alterar a carteira"); }
  };
  const makePrimary = async (wallet) => {
    try {
      await setPrimaryWallet(wallet.id);
      toast.success(`${wallet.name} agora é a carteira principal`);
      await refresh(wallet.id);
    } catch {
      toast.error("Não foi possível definir a carteira principal");
    }
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
      <div className="wallet-toolbar-main">
        <div className="wallet-toolbar-actions">
          <button className="btn btn-ghost" type="button" disabled={summary.active_count < 2} onClick={() => setTransferring(wallets.find((wallet) => wallet.active))}><ArrowRightLeft size={16} /> Transferir</button>
          <button className="btn btn-ghost" type="button" disabled={summary.active_count < 2} onClick={() => setConsolidating(wallets.find((wallet) => wallet.active && wallet.is_primary) || wallets.find((wallet) => wallet.active))}><MoveRight size={16} /> Consolidar</button>
        </div>
        <small className="wallet-consolidation-helper"><CircleHelp size={13} /> Move todo o histórico de uma carteira para outra, preservando o patrimônio total.</small>
      </div>
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
              {wallet.is_primary ? <span className="wallet-primary-status"><Star size={11} fill="currentColor" /> Principal</span> : !wallet.active && <span className="wallet-status">Arquivada</span>}
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

      {(selectedId || detailLoading) && <>
      <button className={`wallet-detail-backdrop ${detailClosing ? "closing" : ""}`} type="button" onClick={closeDetail} aria-label="Fechar detalhes da carteira" />
      <aside className={`card wallet-detail ${detailClosing ? "closing" : ""}`} key={selectedId || "wallet-detail"} style={{ "--wallet-color": detail?.color || selectedWallet?.color || "var(--primary)" }} role={mobileDetail ? "dialog" : undefined} aria-modal={mobileDetail ? "true" : undefined} aria-label={mobileDetail ? `Detalhes de ${detail?.name || selectedWallet?.name || "carteira"}` : undefined}>
        {detailLoading && !detail ? <div className="wallet-detail-loading"><Loader2 className="spin" /> Carregando histórico...</div> : detail && <>
          <div className="wallet-detail-head"><div><small>{detail.institution || "Carteira"}</small><h2>{detail.name}</h2>{detail.is_primary && <span className="wallet-primary-detail"><Star size={12} fill="currentColor" /> Carteira principal</span>}</div><button className="icon-btn" onClick={closeDetail} aria-label="Fechar detalhes"><X size={18} /></button></div>
          <div className="wallet-detail-stats"><div><span>Saldo atual</span><strong>{formatMoney(detail.current_balance, language)}</strong></div><div><span>Entradas · desde o início</span><strong className="money-income">{formatMoney(detail.total_income, language)}</strong></div><div><span>Saídas · desde o início</span><strong className="money-expense">{formatMoney(detail.total_expenses, language)}</strong></div></div>
          <div className="wallet-detail-actions">
            {detail.active && <button className="btn btn-ghost" type="button" onClick={() => setAdjusting(detail)}><SlidersHorizontal size={15} /> Ajustar saldo</button>}
            {detail.active && <button className="btn btn-ghost" type="button" onClick={() => setConsolidating(detail)}><MoveRight size={15} /> Consolidar</button>}
            {detail.active && !detail.is_primary && <button className="btn btn-ghost" type="button" onClick={() => makePrimary(detail)}><Star size={15} /> Definir como principal</button>}
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
      </aside>
      </>}
    </div>

    {editor && <WalletEditor wallet={editor.id ? editor : null} language={language} onClose={() => setEditor(null)} onSaved={refresh} />}
    {adjusting && <BalanceAdjustment wallet={adjusting} language={language} onClose={() => setAdjusting(null)} onSaved={refresh} />}
    {transferring && <TransferEditor wallets={wallets} initialSource={transferring} language={language} onClose={() => setTransferring(null)} onSaved={refresh} />}
    {consolidating && <ConsolidationEditor wallets={wallets} initialSource={consolidating} language={language} onClose={() => setConsolidating(null)} onSaved={refresh} />}
  </section>;
}
