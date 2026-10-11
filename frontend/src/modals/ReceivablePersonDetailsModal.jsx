import { CalendarClock, CircleDollarSign, Pencil, ReceiptText, TriangleAlert, UserRound, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { receivableStatusText } from "../app/helpers.js";
import { formatDateShort, formatMoney } from "../utils/format.js";

export default function ReceivablePersonDetailsModal({ person, groups = [], scope = "pending", loading = false, onClose, onEdit, onOpenReceivable }) {
  const { language } = useI18n();
  const paidScope = scope === "paid";
  const openGroups = groups.filter((group) => group.status !== "paid");
  const overdueGroups = groups.filter((group) => group.status === "overdue");
  const totalOpen = openGroups.reduce((sum, group) => sum + Number(group.remaining_amount || 0), 0);
  const totalOverdue = overdueGroups.reduce((sum, group) => sum + Number(group.remaining_amount || 0), 0);
  const totalPaid = groups.reduce((sum, group) => sum + Number(group.total_amount || 0), 0);

  return (
    <div className="modal-layer receivable-action-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"} />
      <section className="modal-card invoice-modal receivable-person-details-modal" role="dialog" aria-modal="true" aria-labelledby="receivable-person-details-title">
        <header className="transaction-entry-titlebar compact">
          <span className="transaction-entry-icon"><UserRound size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{language === "en-US" ? "PERSON DETAILS" : "DETALHES DA PESSOA"}</p>
            <h2 id="receivable-person-details-title">{person.name}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}>
            <X size={18} />
          </button>
        </header>

        <div className="invoice-modal-body">
          <div className={`receivable-person-detail-summary ${paidScope ? "paid" : ""}`}>
            <div><CircleDollarSign size={17} /><span>{paidScope ? (language === "en-US" ? "Received amount" : "Total recebido") : (language === "en-US" ? "Open amount" : "Total a receber")}</span><strong>{formatMoney(paidScope ? totalPaid : totalOpen, language)}</strong></div>
            {!paidScope && <div className={totalOverdue > 0 ? "danger" : ""}><TriangleAlert size={17} /><span>{language === "en-US" ? "Overdue" : "Total vencido"}</span><strong>{formatMoney(totalOverdue, language)}</strong></div>}
            <div><ReceiptText size={17} /><span>{paidScope ? (language === "en-US" ? "Paid receivables" : "Recebíveis pagos") : (language === "en-US" ? "Open receivables" : "Recebíveis pendentes")}</span><strong>{groups.length}</strong></div>
          </div>

          <section className="receivable-person-history">
            <header>
              <div>
                <h3>{paidScope ? (language === "en-US" ? "Paid receivables" : "Recebíveis pagos") : (language === "en-US" ? "Pending receivables" : "Recebíveis pendentes")}</h3>
                <p>{language === "en-US" ? "Select an item to see payments and actions." : "Selecione um item para ver pagamentos e ações."}</p>
              </div>
            </header>
            {loading ? (
              <p className="receivable-person-history-empty">{language === "en-US" ? "Loading history..." : "Carregando histórico..."}</p>
            ) : groups.length ? (
              <div className="receivable-person-history-list">
                {groups.map((group) => (
                  <button type="button" key={group.key} onClick={() => onOpenReceivable(group.key)}>
                    <span className={`receivable-person-history-icon ${group.status}`}><CalendarClock size={16} /></span>
                    <span className="receivable-person-history-copy">
                      <strong>{group.description}</strong>
                      <small>{formatDateShort(group.due_date, language)} · {receivableStatusText(group.status, language)}</small>
                    </span>
                    <strong>{formatMoney(group.status === "paid" ? group.total_amount : group.remaining_amount, language)}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="receivable-person-history-empty">
                {language === "en-US" ? "No receivables registered for this person." : "Nenhum recebível cadastrado para esta pessoa."}
              </p>
            )}
          </section>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={() => onEdit(person)}><Pencil size={15} /> {language === "en-US" ? "Edit person" : "Editar pessoa"}</button>
          <button className="btn btn-primary" type="button" onClick={onClose}>{language === "en-US" ? "Close" : "Fechar"}</button>
        </div>
      </section>
    </div>
  );
}
