import { useMemo, useState } from "react";
import { Clock3, Edit3, Plus, Repeat2, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { formatDateWithWeekday, formatMoney } from "../utils/format.js";

function isFutureDate(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateString}T00:00:00`) > today;
}

export default function MonthlyTable({ days, summary, onAdd, onEdit, onDelete }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [expanded, setExpanded] = useState(false);
  const visibleDays = useMemo(() => {
    if (expanded) return days;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    return days.filter((day) => {
      const dayDate = new Date(`${day.date}T00:00:00`);
      return day.transactions.length || (dayDate >= today && dayDate <= nextWeek);
    });
  }, [days, expanded]);

  if (!visibleDays.length) {
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
      {visibleDays.map((day, index) => {
        const dayDate = new Date(`${day.date}T00:00:00`);
        const weekSeparator = index > 0 && dayDate.getDay() === 1;
        const future = day.has_future || isFutureDate(day.date);
        return (
          <div key={day.date} className={weekSeparator ? "week-block" : ""}>
            {weekSeparator && <div className="week-separator" />}
            <div className={`day-row ${future ? "future" : ""}`}>
              <div className="day-date">
                {future && <Clock3 size={15} />}
                <span>{formatDateWithWeekday(day.date)}</span>
              </div>

              <div className="day-transactions">
                {day.transactions.length ? (
                  day.transactions.map((tx) => (
                    <div className="transaction-line" key={tx.id}>
                      <span className={`type-chip ${tx.type === "income" ? "income" : "expense"}`}>
                        {tx.type === "income" ? tt("monthlyTable.incomeChip", "GANHO") : tt("monthlyTable.expenseChip", "GASTO")}
                      </span>
                      <strong className={tx.type === "income" ? "money-income" : "money-expense"}>
                        {formatMoney(tx.amount)}
                      </strong>
                      <span className="tx-description">
                        {tx.recurrence_id && <span className="recurrence-pill"><Repeat2 size={12} /> {tt("monthlyTable.recurring", "Recorrente")}</span>}
                        {tx.description || tt("monthlyTable.noDescription", "Sem descrição")}
                      </span>
                      <div className="row-actions">
                        <button className="icon-btn small" onClick={() => onEdit(tx)} aria-label="Editar">
                          <Edit3 size={15} />
                        </button>
                        <button className="icon-btn small danger" onClick={() => onDelete(tx.id)} aria-label="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
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

      <div className="month-footer">
        <button className="btn btn-ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? tt("monthlyTable.viewSummary", "Ver resumo do mês") : tt("monthlyTable.viewAllDays", "Ver todos os dias do mês")}
        </button>
        {summary && (
          <div className="month-totals">
            <span>{tt("monthlyTable.expenses", "Gastos")} {formatMoney(summary.total_expenses)}</span>
            <span>{tt("monthlyTable.income", "Ganhos")} {formatMoney(summary.total_income)}</span>
            <strong>{tt("monthlyTable.closing", "Fechamento")} {formatMoney(summary.projected_closing)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
