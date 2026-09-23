import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { AlertTriangle, Pencil, Plus, Power, Receipt, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import CardModal from "../modals/CardModal.jsx";
import CardActionModal from "../modals/CardActionModal.jsx";
import { useI18n } from "../i18n/index.ts";
import { defaultCardForm, normalizeInvoiceColor } from "../app/helpers.js";
import { createCard, deleteCard, listCards, listWallets, toggleCard, updateCard } from "../api/api.js";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function CardsPage({ onChanged, onViewCurrentInvoice }) {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [cards, setCards] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [editing, setEditing] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    Promise.all([listCards(), listWallets(false)])
      .then(([cardPayload, walletPayload]) => {
        if (!alive) return;
        setCards(cardPayload);
        setWallets(walletPayload.wallets || []);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retryToken]);

  const reload = async () => {
    const payload = await listCards();
    setCards(payload);
    await onChanged?.();
  };

  const saveCard = async (payload) => {
    try {
      if (editing?.id) await updateCard(editing.id, payload);
      else await createCard(payload);
      toast.success(editing?.id ? tt("cards.updated", "Cartão atualizado") : tt("cards.created", "Cartão criado"));
      setEditing(null);
      await reload();
    } catch {
      toast.error(tt("cards.saveError", "Erro ao salvar cartão"));
    }
  };

  const toggle = async (card) => {
    try {
      await toggleCard(card.id);
      toast.success(card.active ? tt("cards.disabled", "Cartão desativado") : tt("cards.enabled", "Cartão reativado"));
      setPendingAction(null);
      await reload();
    } catch {
      toast.error(tt("cards.toggleError", "Erro ao atualizar cartão"));
    }
  };

  const remove = async (card) => {
    try {
      await deleteCard(card.id);
      toast.success(tt("cards.deleted", "Cartão excluído"));
      setPendingAction(null);
      await reload();
    } catch (requestError) {
      toast.error(requestError?.status === 409 ? requestError.message : tt("cards.deleteError", "Erro ao excluir cartão"));
    }
  };

  const openCurrentInvoice = async (card) => {
    setOpeningId(card.id);
    try {
      await onViewCurrentInvoice?.(card);
    } catch {
      toast.error(tt("cards.invoiceError", "Não foi possível abrir a fatura atual"));
    } finally {
      setOpeningId(null);
    }
  };

  const moneyOrDash = (value) => value === null || value === undefined ? "—" : formatMoney(value);

  return (
    <section className="cards-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">{tt("cards.eyebrow", "CARTÕES")}</p>
          <h2>{tt("cards.title", "Cartões")}</h2>
          <p>{tt("cards.subtitle", "Compras novas entram na fatura do ciclo de fechamento. O disponível desconta as faturas ainda não pagas.")}</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setEditing(defaultCardForm())}><Plus size={16} /> {tt("cards.new", "Novo cartão")}</button>
      </div>
      {loading ? <p className="cards-status">{tt("cards.loading", "Carregando cartões...")}</p> : null}
      {error ? (
        <div className="installment-empty-results primary-empty error">
          <span><AlertTriangle size={26} /></span>
          <h3>{tt("cards.loadError", "Não foi possível carregar os cartões")}</h3>
          <p>{tt("cards.loadErrorHint", "Confira sua conexão e tente novamente.")}</p>
          <button className="btn btn-primary" type="button" onClick={() => setRetryToken((value) => value + 1)}>{tt("cards.retry", "Tentar novamente")}</button>
        </div>
      ) : null}
      {!loading && !error && (cards.length ? (
        <div className="credit-card-grid">
          {cards.map((card) => {
            const currentDue = card.current_invoice?.due_date || card.current_due_date;
            return (
              <article className={`plastic-card ${card.active ? "" : "inactive"}`} key={card.id} style={{ "--card-color": normalizeInvoiceColor(card.color) }}>
                <div className="plastic-card-face">
                  <div className="plastic-card-top">
                    <span className="plastic-card-brand">{card.institution || ""}</span>
                    {!card.active && <span className="plastic-card-badge">{tt("cards.inactive", "INATIVO")}</span>}
                  </div>
                  <span className="plastic-chip" aria-hidden="true" />
                  <div className="plastic-card-identity">
                    <strong>{card.name}</strong>
                    <span>{tt("cards.closesOn", "Fecha dia")} {card.closing_day} · {tt("cards.dueOn", "Vence dia")} {card.due_day}</span>
                  </div>
                  <div className="plastic-card-figures">
                    <div><small>{tt("cards.limitShort", "Limite")}</small><strong>{moneyOrDash(card.credit_limit)}</strong></div>
                    <div><small>{tt("cards.available", "Disponível")}</small><strong>{moneyOrDash(card.available)}</strong></div>
                    <div><small>{tt("cards.committed", "Comprometido")}</small><strong>{formatMoney(card.committed || 0)}</strong></div>
                  </div>
                </div>
                <div className="plastic-card-dock">
                    <p className="plastic-card-due">{tt("cards.currentDue", "Fatura atual")} {currentDue ? formatDateShort(currentDue) : "—"}</p>
                    <div className="plastic-card-actions">
                      <button className="plastic-card-action primary" type="button" onClick={() => openCurrentInvoice(card)} disabled={openingId === card.id}><Receipt size={15} /> {tt("cards.viewInvoice", "Ver fatura atual")}</button>
                      <button className="plastic-card-action" type="button" onClick={() => navigate("/faturas", { state: { addPurchaseCardId: card.id } })}><ShoppingBag size={15} /> {tt("cards.addPurchase", "Adicionar compra")}</button>
                      <button className="plastic-card-action" type="button" onClick={() => setEditing(card)}><Pencil size={15} /> {tt("cards.editAction", "Editar")}</button>
                      <button className="plastic-card-action" type="button" onClick={() => card.active ? setPendingAction({ action: "disable", card }) : toggle(card)}>
                        {card.active ? <Power size={15} /> : <RotateCcw size={15} />}
                        {card.active ? tt("cards.disableAction", "Desativar") : tt("cards.enable", "Reativar")}
                      </button>
                      {!card.active && card.can_delete && (
                        <button className="plastic-card-action danger" type="button" onClick={() => setPendingAction({ action: "delete", card })}><Trash2 size={15} /> {tt("cards.deleteAction", "Excluir")}</button>
                      )}
                    </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state"><div className="empty-illustration">+</div><h3>{tt("cards.empty", "Nenhum cartão cadastrado.")}</h3><p>{tt("cards.emptyHint", "Cadastre um cartão para lançar compras na fatura do ciclo certo.")}</p></div>
      ))}
      {editing && <CardModal initial={editing.id ? editing : null} wallets={wallets} onClose={() => setEditing(null)} onSubmit={saveCard} />}
      {pendingAction && (
        <CardActionModal
          card={pendingAction.card}
          action={pendingAction.action}
          onClose={() => setPendingAction(null)}
          onConfirm={pendingAction.action === "delete" ? remove : toggle}
        />
      )}
    </section>
  );
}
