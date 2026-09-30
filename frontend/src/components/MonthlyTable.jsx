import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, Coins, Edit3, Link2, Plus, Receipt, Repeat2, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateWithWeekday, formatMoney } from "../utils/format.js";
import { buildUnifiedExpenseInsight } from "../utils/categoryInsights.js";
import { isInvoiceTransaction, todayIsoDate } from "../app/helpers.js";
import DayWalletsModal from "../modals/DayWalletsModal.jsx";
import ProjectionBreakdownModal from "../modals/ProjectionBreakdownModal.jsx";
import EntryDetailsModal from "../modals/EntryDetailsModal.jsx";

function isFutureDate(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateString}T00:00:00`) > today;
}

export default function MonthlyTable({
  days,
  summary,
  invoices = [],
  expenseOptions = [],
  onAdd,
  onEdit,
  onDelete,
  onOpenReceivable,
  onLoadCategoryDetails,
  onOverlayChange,
  onMoveTransaction,
}) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [viewingTransaction, setViewingTransaction] = useState(null);
  const [walletDay, setWalletDay] = useState(null);
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dropDate, setDropDate] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const dragRef = useRef(null);
  const pointerDragRef = useRef(null);
  const cancelledPointerIdRef = useRef(null);
  const dropDateRef = useRef(null);
  const suppressClickRef = useRef(false);
  const desktopQuery = "(min-width: 768px)";
  const [desktopDrag, setDesktopDrag] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(desktopQuery).matches
      : true
  ));
  const walletRefreshKey = `${summary?.current_balance ?? ""}|${summary?.total_income ?? ""}|${summary?.total_expenses ?? ""}|${days.map((day) => `${day.date}:${day.balance}`).join(",")}`;

  useEffect(() => {
    onOverlayChange?.(Boolean(viewingTransaction || walletDay));
    return () => onOverlayChange?.(false);
  }, [viewingTransaction, walletDay, onOverlayChange]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(desktopQuery);
    const update = () => setDesktopDrag(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => () => {
    document.body.classList.remove("is-transaction-dragging");
  }, []);

  const transactionInsight = (transaction) => {
    if (isInvoiceTransaction(transaction)) return null;
    const category = (transaction.categories?.length ? transaction.categories : transaction.category ? [transaction.category] : [])[0];
    if (!category) return null;
    if (transaction.type === "expense") {
      return buildUnifiedExpenseInsight(expenseOptions, {
        sourceType: "transaction",
        sourceId: transaction.id,
        date: transaction.date,
        amount: transaction.amount,
      }, category, language);
    }
    const categoryEntries = days
      .flatMap((day) => day.transactions)
      .filter((entry) => {
        const entryCategories = entry.categories?.length ? entry.categories : entry.category ? [entry.category] : [];
        return entry.type === transaction.type && entryCategories.some((item) => item.id === category.id);
      })
      .sort((left, right) => String(left.date).localeCompare(String(right.date)) || Number(left.id) - Number(right.id));
    const position = categoryEntries.findIndex((entry) => entry.id === transaction.id) + 1;
    const categoryTotal = categoryEntries.reduce((total, entry) => total + Math.abs(Number(entry.amount || 0)), 0);
    const share = categoryTotal ? Math.min((Math.abs(Number(transaction.amount || 0)) / categoryTotal) * 100, 100) : 0;
    const kind = transaction.type === "income"
      ? (language === "en-US" ? "income" : "ganho")
      : (language === "en-US" ? "expense" : "gasto");
    return {
      label: language === "en-US"
        ? `#${position} ${kind} in ${category.name} this month`
        : `${position}º ${kind} em ${category.name} neste mês`,
      share,
      shareLabel: language === "en-US"
        ? `${share.toLocaleString(language, { maximumFractionDigits: 1 })}% of the category total`
        : `${share.toLocaleString(language, { maximumFractionDigits: 1 })}% do total da categoria`,
    };
  };

  const viewingInsight = useMemo(
    () => viewingTransaction ? transactionInsight(viewingTransaction) : null,
    [days, expenseOptions, language, viewingTransaction],
  );

  const openWithKeyboard = (event, action) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const invoiceFor = (transaction) => invoices.find((invoice) => invoice.id === transaction.invoice_id) || null;
  const draggingTransaction = useMemo(
    () => draggingId === null
      ? null
      : days.flatMap((day) => day.transactions).find((transaction) => transaction.id === draggingId) || null,
    [days, draggingId],
  );
  const dayKey = (value) => String(value || "").slice(0, 10);
  const canDragTransaction = (transaction) => (
    desktopDrag
    && Boolean(onMoveTransaction)
    && !isInvoiceTransaction(transaction)
    && !transaction?.recurrence_id
  );
  const clearDrag = () => {
    dragRef.current = null;
    dropDateRef.current = null;
    setDraggingId(null);
    setDropDate(null);
    setDragPosition(null);
    document.body.classList.remove("is-transaction-dragging");
  };
  const activateDrag = (transaction, x, y) => {
    dragRef.current = transaction;
    setDraggingId(transaction.id);
    setDragPosition({ x, y });
    document.body.classList.add("is-transaction-dragging");
  };
  const startDrag = (event, transaction) => {
    if (event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : bounds.left + (bounds.width / 2);
    const clientY = Number.isFinite(event.clientY) ? event.clientY : bounds.top + (bounds.height / 2);
    activateDrag(transaction, clientX, clientY);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(transaction.id));
      const transparentPreview = document.createElement("canvas");
      transparentPreview.width = 1;
      transparentPreview.height = 1;
      transparentPreview.style.position = "fixed";
      transparentPreview.style.top = "-10px";
      transparentPreview.style.pointerEvents = "none";
      document.body.appendChild(transparentPreview);
      event.dataTransfer.setDragImage(transparentPreview, 0, 0);
      window.setTimeout(() => transparentPreview.remove(), 0);
    }
  };
  const trackDrag = (event) => {
    if (!dragRef.current || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    if (event.clientX === 0 && event.clientY === 0) return;
    setDragPosition({ x: event.clientX, y: event.clientY });
  };
  const pointerDown = (event, transaction) => {
    if ((event.button !== undefined && event.button !== 0) || event.target.closest("button")) return;
    event.preventDefault();
    cancelledPointerIdRef.current = null;
    pointerDragRef.current = {
      pointerId: event.pointerId,
      transaction,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event) => {
    const pending = pointerDragRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const movedEnough = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) >= 5;
    if (!dragRef.current && !movedEnough) return;
    event.preventDefault();
    if (!dragRef.current) activateDrag(pending.transaction, event.clientX, event.clientY);
    else setDragPosition({ x: event.clientX, y: event.clientY });

    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.("[data-day]");
    const nextDropDate = target?.dataset?.day || null;
    const validDropDate = nextDropDate && dayKey(pending.transaction.date) !== nextDropDate
      ? nextDropDate
      : null;
    dropDateRef.current = validDropDate;
    setDropDate(validDropDate);
  };
  const pointerUp = (event) => {
    if (cancelledPointerIdRef.current === event.pointerId) {
      cancelledPointerIdRef.current = null;
      event.preventDefault();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const pending = pointerDragRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!dragRef.current) return;
    event.preventDefault();
    const transaction = dragRef.current;
    const nextDropDate = dropDateRef.current;
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);
    clearDrag();
    if (nextDropDate) onMoveTransaction?.(transaction, nextDropDate);
  };
  const pointerCancel = () => {
    pointerDragRef.current = null;
    if (dragRef.current) clearDrag();
  };
  useEffect(() => {
    if (draggingId === null) return undefined;
    const cancelWithEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelledPointerIdRef.current = pointerDragRef.current?.pointerId ?? null;
      pointerDragRef.current = null;
      clearDrag();
    };
    window.addEventListener("keydown", cancelWithEscape);
    return () => window.removeEventListener("keydown", cancelWithEscape);
  }, [draggingId]);
  const finishDrag = () => {
    if (!dragRef.current) return;
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);
    clearDrag();
  };
  const openTransaction = (transaction) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setViewingTransaction(transaction);
  };
  const allowDrop = (event, date) => {
    const transaction = dragRef.current;
    if (!transaction || dayKey(transaction.date) === date) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dropDateRef.current = date;
    setDropDate(date);
  };
  const dropOnDay = (event, date) => {
    event.preventDefault();
    const transaction = dragRef.current;
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);
    clearDrag();
    if (!transaction || dayKey(transaction.date) === date) return;
    onMoveTransaction?.(transaction, date);
  };
  const plannedTotal = Number(summary?.planned_receivables_total || 0);
  const invoiceProjection = Number(summary?.open_invoices_projected_total || 0);
  const hasPlannedGap = plannedTotal > 0 || invoiceProjection > 0;
  const transactionsClosing = summary?.transactions_projected_closing ?? (
    summary
      ? Number(summary.projected_closing || 0) - plannedTotal
      : null
  );

  if (!days.length) {
    return (
      <div className="empty-state">
        <div className="empty-illustration">+</div>
        <h3>Nenhum lançamento neste mês.</h3>
        <p>Clique em + para adicionar.</p>
      </div>
    );
  }

  return (
    <div className="month-list">
      {days.map((day, index) => {
        const dayDate = new Date(`${day.date}T00:00:00`);
        const weekSeparator = index > 0 && dayDate.getDay() === 1;
        const plannedReceivables = day.planned_receivables || [];
        const hasEntries = day.transactions.length || plannedReceivables.length;
        const future = day.has_future || isFutureDate(day.date);
        const isToday = String(day.date).slice(0, 10) === todayIsoDate();
        const projectedBalance = day.projected_balance ?? day.balance;
        const hasSplitBalance = Number(projectedBalance) !== Number(day.balance);
        return (
          <div key={day.date} className={weekSeparator ? "week-block" : ""}>
            {weekSeparator && <div className="week-separator" />}
            <div
              className={`day-row${isToday ? " is-today" : ""}${future ? " future" : ""}${dropDate === dayKey(day.date) ? " is-drop-target" : ""}`}
              data-day={dayKey(day.date)}
              data-months-tour={index === 0 ? "entries" : undefined}
              aria-current={isToday ? "date" : undefined}
              onDragOver={(event) => allowDrop(event, dayKey(day.date))}
              onDrop={(event) => dropOnDay(event, dayKey(day.date))}
            >
              <div className="day-date">
                {isToday && <span className="today-badge">{tt("monthlyTable.today", "Hoje")}</span>}
                {future && !isToday && <Clock3 size={15} />}
                <span>{formatDateWithWeekday(day.date)}</span>
              </div>

              <div className="day-transactions">
                {hasEntries ? (
                  <>
                    {day.transactions.map((tx) => {
                      const draggable = canDragTransaction(tx);
                      const dragHint = tt("monthlyTable.dragTransaction", "Arraste para outro dia para mudar a data");
                      return (
                      <div
                        className={`transaction-line is-clickable${draggable ? " is-draggable" : ""}${draggingId === tx.id ? " is-dragging" : ""}`}
                        key={tx.id}
                        role="button"
                        tabIndex="0"
                        draggable={draggable || undefined}
                        onClick={() => openTransaction(tx)}
                        onKeyDown={(event) => openWithKeyboard(event, () => openTransaction(tx))}
                        onPointerDown={draggable ? (event) => pointerDown(event, tx) : undefined}
                        onPointerMove={draggable ? pointerMove : undefined}
                        onPointerUp={draggable ? pointerUp : undefined}
                        onPointerCancel={draggable ? pointerCancel : undefined}
                        onDragStart={draggable ? (event) => startDrag(event, tx) : undefined}
                        onDrag={draggable ? trackDrag : undefined}
                        onDragEnd={draggable ? finishDrag : undefined}
                        aria-grabbed={draggable ? draggingId === tx.id : undefined}
                        aria-label={`${language === "en-US" ? "View details for" : "Ver detalhes de"} ${tx.description || tt("monthlyTable.noDescription", "Sem descrição")}${draggable ? `. ${dragHint}` : ""}`}
                        title={draggable ? dragHint : undefined}
                      >
                        <span className={`type-chip ${tx.type === "income" ? "income" : "expense"}`}>
                          {tx.type === "income" ? tt("monthlyTable.incomeChip", "GANHO") : tt("monthlyTable.expenseChip", "GASTO")}
                        </span>
                        <strong className={tx.type === "income" ? "money-income" : "money-expense"}>
                          {formatMoney(tx.amount)}
                        </strong>
                        <span className="tx-description">
                          <span className="tx-badges">
                            {tx.recurrence_id && <span className="recurrence-pill"><Repeat2 size={12} /> {tt("monthlyTable.recurring", "Recorrente")}</span>}
                            {tx.linked_expense && <span className="transaction-expense-pill" title={`Associado a ${tx.linked_expense.description}`}><Link2 size={12} /> {tt("receivables.linkedExpense", "Gasto associado")}</span>}
                            {isInvoiceTransaction(tx) ? (
                              <span className="invoice-pill"><Receipt size={12} /> {tt("monthlyTable.invoice", "Fatura")}</span>
                            ) : (tx.categories?.length ? tx.categories : tx.category ? [tx.category] : []).map((category) => (
                              <span className="transaction-category-pill" style={{ "--category-color": category.color }} key={category.id}>{category.name}</span>
                            ))}
                          </span>
                          <span className="tx-description-text">{tx.description || tt("monthlyTable.noDescription", "Sem descrição")}</span>
                        </span>
                        <div className="row-actions">
                          <button className="icon-btn small" onClick={(event) => { event.stopPropagation(); onEdit(tx); }} aria-label={isInvoiceTransaction(tx) ? tt("monthlyTable.viewInvoiceItems", "Ver itens da fatura") : "Editar"}>
                            <Edit3 size={15} />
                          </button>
                          <button className="icon-btn small danger" onClick={(event) => { event.stopPropagation(); onDelete(tx); }} aria-label="Excluir">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                    {plannedReceivables.map((receivable) => {
                      const installment = receivable.series_installment_count > 1
                        ? ` · ${receivable.series_installment_number}/${receivable.series_installment_count}`
                        : "";
                      return (
                        <div
                          className="transaction-line is-clickable planned-receivable-line"
                          key={`receivable-${receivable.id}`}
                          role="button"
                          tabIndex="0"
                          onClick={() => onOpenReceivable?.(receivable)}
                          onKeyDown={(event) => openWithKeyboard(event, () => onOpenReceivable?.(receivable))}
                          aria-label={`${tt("monthlyTable.plannedReceivable", "Recebível previsto")}: ${receivable.description}`}
                        >
                          <span className="type-chip planned">
                            {tt("monthlyTable.plannedChip", "PREVISTO")}
                          </span>
                          <strong className="money-planned">
                            {formatMoney(receivable.remaining_amount)}
                          </strong>
                          <span className="tx-description">
                            <span className="tx-badges">
                              <span className="planned-pill"><Coins size={12} /> {tt("monthlyTable.receivable", "Recebível")}</span>
                            </span>
                            <span className="tx-description-text">
                              {receivable.person_name ? `${receivable.person_name} · ` : ""}
                              {receivable.description}
                              {installment}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <span className="tx-description">{tt("monthlyTable.nextDayWithoutEntries", "Sem lançamentos")}</span>
                )}
              </div>

              <button
                type="button"
                className={`day-balance${hasSplitBalance ? " has-split" : ""}`}
                onClick={() => setWalletDay(day)}
                aria-label={`${tt("monthlyTable.openDayWallets", "Ver saldo por carteira")} ${formatDateWithWeekday(day.date)}`}
              >
                {hasSplitBalance ? (
                  <>
                    <div>
                      <span>{tt("monthlyTable.realizedBalance", "Saldo real")}</span>
                      <strong>{formatMoney(day.balance)}</strong>
                    </div>
                    <div className="day-balance-projected">
                      <span>{tt("monthlyTable.projectedBalance", "Saldo previsto")}</span>
                      <strong>{formatMoney(projectedBalance)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{tt("monthlyTable.balanceChip", "Saldo")}</span>
                    <strong>{formatMoney(day.balance)}</strong>
                  </>
                )}
              </button>
              <button className="icon-btn add-day" onClick={() => onAdd(day.date)} aria-label="Adicionar">
                <Plus size={17} />
              </button>
            </div>
          </div>
        );
      })}

      <div className="month-footer" data-months-tour="summary">
        {summary && (
          <div className="month-totals">
            <span>{tt("monthlyTable.income", "Ganhos")} {formatMoney(summary.total_income)}</span>
            <span>{tt("monthlyTable.expenses", "Gastos")} {formatMoney(summary.total_expenses)}</span>
            {hasPlannedGap && (
              <span>
                {tt("monthlyTable.realizedClosing", "Fechamento real")} {formatMoney(transactionsClosing)}
              </span>
            )}
            <button className="month-projection-trigger" type="button" onClick={() => setProjectionOpen(true)}>
              {hasPlannedGap
                ? tt("monthlyTable.projectedClosing", "Fechamento previsto")
                : tt("monthlyTable.closing", "Fechamento")}{" "}
              {formatMoney(summary.projected_closing)}
            </button>
          </div>
        )}
      </div>
      {projectionOpen && summary && (
        <ProjectionBreakdownModal summary={summary} onClose={() => setProjectionOpen(false)} />
      )}
      {walletDay && (
        <DayWalletsModal
          date={walletDay.date}
          expectedBalance={walletDay.balance}
          summary={summary}
          refreshKey={walletRefreshKey}
          onClose={() => setWalletDay(null)}
        />
      )}
      {viewingTransaction && (
        <EntryDetailsModal
          item={viewingTransaction}
          invoice={invoiceFor(viewingTransaction)}
          insight={viewingInsight}
          onLoadCategoryDetails={onLoadCategoryDetails}
          onClose={() => setViewingTransaction(null)}
          onEdit={() => {
            const transaction = viewingTransaction;
            setViewingTransaction(null);
            onEdit(transaction);
          }}
        />
      )}
      {draggingTransaction && dragPosition && createPortal(
        <div
          className="transaction-drag-overlay"
          style={{ left: dragPosition.x + 18, top: dragPosition.y }}
          aria-hidden="true"
        >
          <span className={`type-chip ${draggingTransaction.type === "income" ? "income" : "expense"}`}>
            {draggingTransaction.type === "income"
              ? tt("monthlyTable.incomeChip", "GANHO")
              : tt("monthlyTable.expenseChip", "GASTO")}
          </span>
          <strong className={draggingTransaction.type === "income" ? "money-income" : "money-expense"}>
            {formatMoney(draggingTransaction.amount)}
          </strong>
          <span className="transaction-drag-description">
            {draggingTransaction.description || tt("monthlyTable.noDescription", "Sem descrição")}
          </span>
        </div>,
        document.body,
      )}
    </div>
  );
}
