import { useEffect, useMemo, useState } from "react";
import { Clock3, Coins, Edit3, Link2, Plus, Receipt, Repeat2, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateWithWeekday, formatMoney } from "../utils/format.js";
import { buildUnifiedExpenseInsight } from "../utils/categoryInsights.js";
import { isInvoiceTransaction } from "../app/helpers.js";
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
}) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [viewingTransaction, setViewingTransaction] = useState(null);

  useEffect(() => {
    onOverlayChange?.(Boolean(viewingTransaction));
    return () => onOverlayChange?.(false);
  }, [viewingTransaction, onOverlayChange]);

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
  const plannedTotal = Number(summary?.planned_receivables_total || 0);
  const hasPlannedGap = plannedTotal > 0;
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
        return (
          <div key={day.date} className={weekSeparator ? "week-block" : ""}>
            {weekSeparator && <div className="week-separator" />}
            <div className={`day-row ${future ? "future" : ""}`} data-months-tour={index === 0 ? "entries" : undefined}>
              <div className="day-date">
                {future && <Clock3 size={15} />}
                <span>{formatDateWithWeekday(day.date)}</span>
              </div>

              <div className="day-transactions">
                {hasEntries ? (
                  <>
                    {day.transactions.map((tx) => (
                      <div
                        className="transaction-line is-clickable"
                        key={tx.id}
                        role="button"
                        tabIndex="0"
                        onClick={() => setViewingTransaction(tx)}
                        onKeyDown={(event) => openWithKeyboard(event, () => setViewingTransaction(tx))}
                        aria-label={`${language === "en-US" ? "View details for" : "Ver detalhes de"} ${tx.description || tt("monthlyTable.noDescription", "Sem descrição")}`}
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
                    ))}
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

              <div className="day-balance">
                <span>{tt("monthlyTable.balanceChip", "Saldo")}</span>
                <strong>{formatMoney(day.balance)}</strong>
              </div>
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
              <>
                <span className="month-total-planned">
                  {tt("monthlyTable.plannedReceivables", "Recebíveis previstos")} {formatMoney(plannedTotal)}
                </span>
                <span>
                  {tt("monthlyTable.realizedClosing", "Fechamento real")} {formatMoney(transactionsClosing)}
                </span>
              </>
            )}
            <strong>
              {hasPlannedGap
                ? tt("monthlyTable.projectedClosing", "Fechamento previsto")
                : tt("monthlyTable.closing", "Fechamento")}{" "}
              {formatMoney(summary.projected_closing)}
            </strong>
          </div>
        )}
      </div>
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
    </div>
  );
}
