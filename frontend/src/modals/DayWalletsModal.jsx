import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, Loader2, Wallet, X } from "lucide-react";
import { getDayWallets } from "../api/api.js";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";
import "./financeSheets.css";

const REASON_KEYS = {
  income: ["monthlyTable.reasonIncome", "Ganho"],
  expense: ["monthlyTable.reasonExpense", "Gasto"],
  adjustment: ["monthlyTable.reasonAdjustment", "Ajuste manual de saldo"],
  transfer_in: ["monthlyTable.reasonTransferIn", "Transferência recebida"],
  transfer_out: ["monthlyTable.reasonTransferOut", "Transferência enviada"],
  initial_balance: ["monthlyTable.reasonInitial", "Entrada inicial da carteira"],
  unchanged: ["monthlyTable.reasonUnchanged", "Sem alteração"],
};

function parseDay(dateValue) {
  const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

export default function DayWalletsModal({ date, refreshKey = "", onClose }) {
  const { t, language } = useI18n();
  const tt = (key, pt) => (language === "en-US" ? t(key) : pt);
  const closeButtonRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openWalletIds, setOpenWalletIds] = useState([]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const { year, month, day } = parseDay(date);
    setLoading(true);
    setError(false);
    getDayWallets(year, month, day, { signal: controller.signal })
      .then((payload) => {
        setDetail(payload);
        setOpenWalletIds([]);
        setLoading(false);
      })
      .catch((requestError) => {
        if (requestError?.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [date, refreshKey]);

  const reasonLabel = (kind, archived = false) => {
    const [key, pt] = REASON_KEYS[kind] || REASON_KEYS.unchanged;
    const label = tt(key, pt);
    return archived ? `${label} · ${tt("monthlyTable.archivedWallet", "carteira arquivada")}` : label;
  };

  const wallets = detail?.wallets || [];
  const openingTotal = wallets.reduce((sum, wallet) => sum + Number(wallet.balance_before || 0), 0);
  const closingTotal = detail?.consolidated_balance;
  const toggleWallet = (walletId) => {
    setOpenWalletIds((current) => (
      current.includes(walletId) ? current.filter((id) => id !== walletId) : [...current, walletId]
    ));
  };

  return createPortal(
    <div className="finance-sheet-layer">
      <button className="finance-sheet-backdrop" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close details" : "Fechar detalhes"} />
      <section className="finance-sheet finance-sheet--wallet" role="dialog" aria-modal="true" aria-labelledby="wallet-sheet-title">
        <div className="finance-sheet-grabber" aria-hidden="true" />
        <header className="finance-sheet-header">
          <i className="finance-sheet-heading-icon"><Wallet size={20} /></i>
          <div className="finance-sheet-heading">
            <small>{formatDateShort(date, language)}</small>
            <h2 id="wallet-sheet-title">{tt("monthlyTable.dayWalletsTitle", "Saldo por carteira")}</h2>
          </div>
          <button ref={closeButtonRef} className="finance-sheet-close" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close" : "Fechar"}><X size={18} /></button>
        </header>

        {!loading && !error && (
          <div className="finance-sheet-summary finance-sheet-summary--two">
            <div><small>{tt("monthlyTable.startOfDay", "Início do dia")}</small><strong>{formatMoney(openingTotal, language)}</strong></div>
            <div><small>{tt("monthlyTable.endOfDay", "Fim do dia")}</small><strong>{formatMoney(closingTotal, language)}</strong></div>
          </div>
        )}

        <div className="finance-sheet-scroll">
          <div className="finance-sheet-body">
            {loading ? (
              <div className="finance-sheet-status"><Loader2 className="spin" size={22} /><span>{tt("monthlyTable.dayWalletsLoading", "Carregando saldos…")}</span></div>
            ) : error ? (
              <div className="finance-sheet-status is-error"><AlertTriangle size={22} /><span>{tt("monthlyTable.dayWalletsError", "Não foi possível carregar os saldos das carteiras.")}</span></div>
            ) : wallets.map((wallet) => {
              const open = openWalletIds.includes(wallet.wallet_id);
              const variation = Number(wallet.variation);
              return (
                <article className="finance-accordion" style={{ "--finance-accent": wallet.color }} key={wallet.wallet_id}>
                  <button className="finance-accordion-button" type="button" aria-expanded={open} onClick={() => toggleWallet(wallet.wallet_id)}>
                    <i className="finance-accordion-icon"><Wallet size={17} /></i>
                    <span className="finance-accordion-copy">
                      <strong>{wallet.wallet_name}</strong>
                      <small>
                        {formatMoney(wallet.balance_before, language)} <em>→</em> {formatMoney(wallet.balance, language)} <em>·</em>{" "}
                        {(wallet.reasons || []).map((reason) => {
                          const archived = (wallet.movements || []).some((movement) => movement.kind === reason && movement.counterpart_archived);
                          return reasonLabel(reason, archived);
                        }).join(" · ")}
                      </small>
                    </span>
                    <strong className={`finance-accordion-amount${variation > 0 ? " finance-positive" : variation < 0 ? " finance-negative" : ""}`}>{formatMoney(wallet.variation, language)}</strong>
                    <ChevronDown className="finance-accordion-chevron" size={16} />
                  </button>

                  {open && (
                    <div className="finance-accordion-panel">
                      {wallet.movements?.length ? wallet.movements.map((movement, index) => {
                        const expense = movement.kind === "expense" || Number(movement.amount) < 0;
                        return (
                          <div className={`finance-detail-row${expense ? " is-expense" : ""}`} key={`${movement.kind}-${index}`}>
                            <i className="finance-detail-icon"><Wallet size={16} /></i>
                            <span className="finance-detail-copy">
                              <strong>{movement.description || reasonLabel(movement.kind, movement.counterpart_archived)}</strong>
                              <small>
                                {formatDateShort(movement.date, language)} <em>·</em> {reasonLabel(movement.kind, movement.counterpart_archived)}
                                {movement.counterpart_wallet_name ? ` · ${movement.counterpart_wallet_name}` : ""}
                              </small>
                            </span>
                            <strong className={`finance-detail-amount ${expense ? "finance-negative" : "finance-positive"}`}>{formatMoney(movement.amount, language)}</strong>
                          </div>
                        );
                      }) : <p className="finance-accordion-empty">{tt("monthlyTable.reasonUnchanged", "Sem alteração")}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
