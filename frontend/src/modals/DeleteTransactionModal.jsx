import { Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function DeleteTransactionModal({ transaction, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt) => language === "en-US" ? t(key) : pt;
  const isIncome = transaction.type === "income";

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={tt("actions.cancel", "Cancelar")} />
      <div className="modal-card template-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-transaction-title">
        <div className="modal-titlebar">
          <div className="modal-icon danger"><Trash2 size={22} /></div>
          <div>
            <p className="eyebrow">{tt("monthlyTable.entry", "Lançamento")}</p>
            <h2 id="delete-transaction-title">{tt("monthlyTable.deleteEntry", "Excluir lançamento")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={tt("actions.close", "Fechar modal")}><X size={18} /></button>
        </div>

        <div className="confirm-modal-body">
          <p>{tt("monthlyTable.deleteEntryMessage", "Deseja realmente excluir este lançamento? Esta ação não pode ser desfeita.")}</p>
          <div className="transaction-delete-context">
            <div>
              <small>{formatDateShort(transaction.date, language)} · {isIncome ? tt("monthlyTable.incomeChip", "GANHO") : tt("monthlyTable.expenseChip", "GASTO")}</small>
              <strong>{transaction.description || tt("monthlyTable.noDescription", "Sem descrição")}</strong>
              {transaction.category && (
                <span className="transaction-category-pill" style={{ "--category-color": transaction.category.color }}>{transaction.category.name}</span>
              )}
            </div>
            <strong className={isIncome ? "money-income" : "money-expense"}>{formatMoney(transaction.amount, language)}</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary danger-action" type="button" onClick={onConfirm}><Trash2 size={16} /> {tt("actions.delete", "Excluir")}</button>
        </div>
      </div>
    </div>
  );
}
