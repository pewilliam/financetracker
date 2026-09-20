import { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, Pencil, Trash2, Undo2, Wallet, X } from "lucide-react";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney } from "../utils/format.js";
import { receivableStatusText } from "../app/helpers.js";

function installmentLabelFor(item, tt) {
  if (item.series_installment_count > 1) {
    return {
      current: item.series_installment_number,
      total: item.series_installment_count,
      text: tt("receivables.installmentOf", `Parcela ${item.series_installment_number}/${item.series_installment_count}`, {
        current: item.series_installment_number,
        total: item.series_installment_count
      })
    };
  }
  if (item.linked_expense?.installment_number) {
    return {
      current: item.linked_expense.installment_number,
      total: item.linked_expense.installment_count,
      text: tt("receivables.installmentOf", `Parcela ${item.linked_expense.installment_number}/${item.linked_expense.installment_count}`, {
        current: item.linked_expense.installment_number,
        total: item.linked_expense.installment_count
      })
    };
  }
  return null;
}

function statusTone(status) {
  if (status === "paid") return "paid";
  if (status === "overdue") return "danger";
  if (status === "partial") return "pending";
  return "pending";
}

function isPaidReceivable(item) {
  return item.status === "paid";
}

export default function ReceivableDetailsModal({
  group,
  busy = false,
  onClose,
  onEdit,
  onEditLinkedTransaction,
  onPaid,
  onPayment,
  onDelete,
  onDeletePayment
}) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => (language === "en-US" ? t(key, values) : pt);
  const closeButtonRef = useRef(null);
  const isGroup = Boolean(group?.isGroup);
  const item = !isGroup ? group?.items?.[0] : null;
  const paidCount = group?.items?.filter(isPaidReceivable).length || 0;
  const nextOpen = group?.items?.find((entry) => !isPaidReceivable(entry));

  const itemGroups = useMemo(() => {
    const open = [];
    const paid = [];
    (group?.items || []).forEach((entry) => {
      if (isPaidReceivable(entry)) paid.push(entry);
      else open.push(entry);
    });
    const groups = [];
    if (open.length) {
      groups.push({
        id: "open",
        tone: "open",
        title: language === "en-US" ? "Open" : "Em aberto",
        items: open,
        total: open.reduce((sum, entry) => sum + Number(entry.remaining_amount || 0), 0)
      });
    }
    if (paid.length) {
      groups.push({
        id: "paid",
        tone: "paid",
        title: language === "en-US" ? "Paid" : "Pagas",
        items: paid,
        total: paid.reduce((sum, entry) => sum + Number(entry.total_amount || 0), 0)
      });
    }
    return groups;
  }, [group?.items, language]);

  useModalLifecycle({
    onClose,
    busy,
    initialFocusRef: closeButtonRef,
    autoFocus: !busy
  });

  if (!group) return null;

  const runAction = (type, target) => {
    // Transaction drawer sits under this details layer; close first so the editor is usable.
    if (type === "editLinked") onClose();
    if (type === "edit") onEdit(target);
    else if (type === "editLinked") onEditLinkedTransaction(target.transaction);
    else if (type === "paid") onPaid(target);
    else if (type === "payment") onPayment(target);
    else if (type === "delete") onDelete(target);
  };

  const handleDeletePayment = (target, payment) => {
    if (!onDeletePayment || !payment) return;
    onDeletePayment(target, payment);
  };

  const renderPaymentChips = (entry) => {
    if (!entry.payments?.length) return null;
    return (
      <div className="receivable-payments">
        {entry.payments.map((payment) => (
          <button
            key={payment.id}
            type="button"
            disabled={busy}
            onClick={() => handleDeletePayment(entry, payment)}
            title={tt("receivables.cancelPayment", "Cancelar pagamento")}
            aria-label={tt("receivables.cancelPayment", "Cancelar pagamento")}
          >
            <span>{formatDateShort(payment.paid_at, language)} · {formatMoney(payment.amount, language)}</span>
            <X size={13} />
          </button>
        ))}
      </div>
    );
  };

  const renderItem = (entry) => {
    const label = installmentLabelFor(entry, tt);
    const isNext = nextOpen && entry.id === nextOpen.id && entry.record_kind === nextOpen.record_kind;
    const dueLabel = formatDateShort(entry.due_date, language);
    const payments = entry.payments || [];
    const latestPayment = payments[payments.length - 1];
    return (
      <div
        className={`installment-details-item receivable-details-row ${isNext ? "is-next" : ""} ${payments.length > 1 ? "has-payments" : ""}`}
        role="row"
        key={`${entry.record_kind}-${entry.id}`}
      >
        <span className="installment-item-number" role="cell">
          <small>{tt("receivables.installment", "Parcela")}</small>
          <strong>{label ? `${label.current}/${label.total}` : "—"}</strong>
          {isNext && <em>{language === "en-US" ? "Next" : "Próxima"}</em>}
        </span>
        <span className="receivable-row-amount" role="cell">
          <small>{tt("receivables.total", "Total")}</small>
          <strong>{formatMoney(entry.total_amount, language)}</strong>
          <em>{dueLabel}</em>
        </span>
        <span className="receivable-row-remaining" role="cell">
          <small>{tt("receivables.remaining", "Restante")}</small>
          <strong>{formatMoney(entry.remaining_amount, language)}</strong>
        </span>
        <span className="receivable-row-due" role="cell">
          <small>{tt("receivables.dueDate", "Vencimento")}</small>
          <span>{dueLabel}</span>
        </span>
        <span className="receivable-row-status" role="cell">
          <small>{tt("receivables.status", "Status")}</small>
          <span className={`installment-status ${statusTone(entry.status)}`}>
            {receivableStatusText(entry.status, language)}
          </span>
        </span>
        <span className="installment-row-actions receivable-row-actions" role="cell">
          {entry.record_kind === "linked_transaction" ? (
            <button
              className="icon-btn small"
              type="button"
              disabled={busy}
              onClick={() => runAction("editLinked", entry)}
              title={tt("receivables.editLinkedEntry", "Editar lançamento")}
              aria-label={tt("receivables.editLinkedEntry", "Editar lançamento")}
            >
              <Pencil size={15} />
            </button>
          ) : (
            <>
              <button
                className="icon-btn small"
                type="button"
                disabled={busy}
                onClick={() => runAction("edit", entry)}
                title={tt("actions.edit", "Editar")}
                aria-label={tt("actions.edit", "Editar")}
              >
                <Pencil size={15} />
              </button>
              {entry.status !== "paid" && (
                <>
                  <button
                    className="icon-btn small"
                    type="button"
                    disabled={busy}
                    onClick={() => runAction("payment", entry)}
                    title={tt("receivables.partialPayment", "Pagamento parcial")}
                    aria-label={tt("receivables.partialPayment", "Pagamento parcial")}
                  >
                    <Wallet size={15} />
                  </button>
                  <button
                    className="icon-btn small success"
                    type="button"
                    disabled={busy}
                    onClick={() => runAction("paid", entry)}
                    title={tt("receivables.markPaid", "Marcar como pago")}
                    aria-label={tt("receivables.markPaid", "Marcar como pago")}
                  >
                    <Check size={15} />
                  </button>
                </>
              )}
              {payments.length === 1 && (
                <button
                  className="icon-btn small danger"
                  type="button"
                  disabled={busy}
                  onClick={() => handleDeletePayment(entry, latestPayment)}
                  title={tt("receivables.cancelPayment", "Cancelar pagamento")}
                  aria-label={tt("receivables.cancelPayment", "Cancelar pagamento")}
                >
                  <Undo2 size={15} />
                </button>
              )}
              {!payments.length && (
                <button
                  className="icon-btn small danger"
                  type="button"
                  disabled={busy}
                  onClick={() => runAction("delete", entry)}
                  title={tt("actions.delete", "Excluir")}
                  aria-label={tt("actions.delete", "Excluir")}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </span>
        {payments.length > 1 && (
          <div className="receivable-installment-payments" role="cell">
            {renderPaymentChips(entry)}
          </div>
        )}
      </div>
    );
  };

  const categories = group.categories || [];
  const linked = group.linked_expense || item?.linked_expense;
  const countLabel = group.count === 1
    ? tt("receivables.groupCountOne", "1 parcela")
    : tt("receivables.groupCount", `${group.count} parcelas`, { count: group.count });

  return createPortal(
    <div className="modal-layer installment-details-layer receivable-details-layer">
      <button className="modal-backdrop" type="button" onClick={busy ? undefined : onClose} aria-label={language === "en-US" ? "Close details" : "Fechar detalhes"} />
      <div className="modal-card invoice-modal installment-details-modal receivable-details-modal" role="dialog" aria-modal="true" aria-labelledby="receivable-details-title">
        <header className="transaction-entry-titlebar installment-entry-titlebar compact installment-details-titlebar">
          <span className="transaction-entry-icon"><Wallet size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{language === "en-US" ? "RECEIVABLE DETAILS" : "DETALHES DO RECEBÍVEL"}</p>
            <h2 id="receivable-details-title">{group.description}</h2>
            <div className="installment-details-heading-meta">
              <span>{group.person_name}</span>
              {isGroup && (
                <span>
                  {paidCount} {language === "en-US" ? "of" : "de"} {group.count} {language === "en-US" ? "paid" : "pagas"}
                </span>
              )}
              <div className="installment-details-categories">
                {categories.length
                  ? categories.map((category) => (
                    <span className="category-badge" style={{ "--category-color": category.color || "#7ab898" }} key={category.id}>{category.name}</span>
                  ))
                  : null}
                {isGroup && <span className="receivable-series-badge">{countLabel}</span>}
              </div>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-btn"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}
            title={language === "en-US" ? "Close" : "Fechar"}
          >
            <X size={18} />
          </button>
        </header>

        <div className="installment-details-scroll">
          <section className="installment-financial-summary" aria-label={language === "en-US" ? "Financial summary" : "Resumo financeiro"}>
            <div>
              <span>{tt("receivables.total", "Total")}</span>
              <strong>{formatMoney(group.total_amount, language)}</strong>
            </div>
            <div>
              <span>{tt("receivables.received", "Recebido")}</span>
              <strong>{formatMoney(group.received_amount, language)}</strong>
            </div>
            <div>
              <span>{tt("receivables.remaining", "Restante")}</span>
              <strong>{formatMoney(group.remaining_amount, language)}</strong>
            </div>
          </section>

          <dl className="installment-purchase-meta">
            <div>
              <dt>{isGroup ? tt("receivables.nextDue", "Próximo vencimento") : tt("receivables.dueDate", "Vencimento")}</dt>
              <dd>{formatDateShort(group.due_date, language)}</dd>
            </div>
            <div>
              <dt>{tt("receivables.status", "Status")}</dt>
              <dd>
                <span className={`installment-status ${statusTone(group.status)}`}>
                  {receivableStatusText(group.status, language)}
                </span>
              </dd>
            </div>
            {isGroup && (
              <div>
                <dt>{tt("receivables.installments", "Parcelas")}</dt>
                <dd>{group.count}</dd>
              </div>
            )}
            {item?.record_kind === "linked_transaction" && (
              <div>
                <dt>{tt("receivables.origin", "Origem")}</dt>
                <dd>{tt("receivables.linkedEntryBadge", "Vinculado por um lançamento")}</dd>
              </div>
            )}
          </dl>

          {linked && (
            <div className="receivable-details-link">
              <Link2 size={15} />
              <div>
                <span>
                  {linked.origin === "months"
                    ? (language === "en-US" ? "Monthly control" : "Controle mensal")
                    : linked.invoice_name || (language === "en-US" ? "Invoice" : "Fatura")}
                  {linked.installment_number ? ` · ${linked.installment_number}/${linked.installment_count}` : ""}
                </span>
                <strong>{linked.description}</strong>
              </div>
            </div>
          )}

          {!isGroup && item?.notes && (
            <p className="receivable-details-notes">{item.notes}</p>
          )}

          {!isGroup && item?.payments?.length > 0 && (
            <section className="receivable-details-payments">
              <h3>{tt("receivables.payments", "Pagamentos")}</h3>
              {renderPaymentChips(item)}
            </section>
          )}

          {isGroup && (
            <section className="installment-items-section">
              <div className="installment-items-title">
                <div>
                  <h3>{tt("receivables.installments", "Parcelas")}</h3>
                  <p>{language === "en-US" ? "Amounts, due dates, and status for each receivable." : "Valores, vencimentos e status de cada recebível."}</p>
                </div>
                <span>{group.items.length}</span>
              </div>

              <div className="installment-details-table receivable-details-table" role="table" aria-label={tt("receivables.installments", "Parcelas")}>
                <div className="installment-details-table-head" role="row">
                  <span role="columnheader">{tt("receivables.installment", "Parcela")}</span>
                  <span role="columnheader">{tt("receivables.total", "Total")}</span>
                  <span role="columnheader">{tt("receivables.remaining", "Restante")}</span>
                  <span role="columnheader">{tt("receivables.dueDate", "Vencimento")}</span>
                  <span role="columnheader">{tt("receivables.status", "Status")}</span>
                  <span role="columnheader" className="sr-only">{language === "en-US" ? "Actions" : "Ações"}</span>
                </div>
                <div className="installment-details-list">
                  {itemGroups.map((statusGroup) => (
                    <section className={`installment-details-group ${statusGroup.tone}`} key={statusGroup.id} aria-labelledby={`receivable-group-${statusGroup.id}`}>
                      <header className="installment-details-group-head">
                        <span id={`receivable-group-${statusGroup.id}`}><i aria-hidden="true" />{statusGroup.title}</span>
                        <small>{statusGroup.items.length}</small>
                        <strong>{formatMoney(statusGroup.total, language)}</strong>
                      </header>
                      <div className="installment-details-group-list">
                        {statusGroup.items.map(renderItem)}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        <footer className="modal-actions installment-details-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>{language === "en-US" ? "Close" : "Fechar"}</button>
          {!isGroup && item && (
            item.record_kind === "linked_transaction" ? (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => runAction("editLinked", item)}>
                <Pencil size={15} /> {tt("receivables.editLinkedEntry", "Editar lançamento")}
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => runAction("edit", item)}>
                  <Pencil size={15} /> {tt("actions.edit", "Editar")}
                </button>
                {item.status !== "paid" && (
                  <>
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => runAction("payment", item)}>
                      {tt("receivables.partialPayment", "Pagamento parcial")}
                    </button>
                    <button className="btn btn-primary" type="button" disabled={busy} onClick={() => runAction("paid", item)}>
                      <Check size={15} /> {tt("receivables.markPaid", "Marcar como pago")}
                    </button>
                  </>
                )}
                {item.payments?.length === 1 ? (
                  <button className="btn btn-ghost danger-text" type="button" disabled={busy} onClick={() => handleDeletePayment(item, item.payments[0])}>
                    <Undo2 size={15} /> {tt("receivables.cancelPayment", "Cancelar pagamento")}
                  </button>
                ) : !item.payments?.length ? (
                  <button className="btn btn-ghost danger-text" type="button" disabled={busy} onClick={() => runAction("delete", item)}>
                    <Trash2 size={15} /> {tt("actions.delete", "Excluir")}
                  </button>
                ) : null}
              </>
            )
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
