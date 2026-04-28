import { useMemo, useState } from "react";
import { Clock3, Edit3, Plus, Trash2 } from "lucide-react";
import { formatDateWithWeekday, formatMoney } from "../utils/format.js";

function isFutureDate(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateString}T00:00:00`) > today;
}

export default function MonthlyTable({ days, summary, onAdd, onEdit, onDelete }) {
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
                        {tx.type === "income" ? "GANHO" : "GASTO"}
                      </span>
                      <strong className={tx.type === "income" ? "money-income" : "money-expense"}>
                        {formatMoney(tx.amount)}
                      </strong>
                      <span className="tx-description">{tx.description || "Sem descrição"}</span>
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
                  <span className="tx-description">Próximo dia sem lançamentos</span>
                )}
              </div>

              <div className="day-balance">
                <span>Saldo</span>
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
          {expanded ? "Ver resumo do mês" : "Ver todos os dias do mês"}
        </button>
        {summary && (
          <div className="month-totals">
            <span>Gastos {formatMoney(summary.total_expenses)}</span>
            <span>Ganhos {formatMoney(summary.total_income)}</span>
            <strong>Fechamento {formatMoney(summary.projected_closing)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
