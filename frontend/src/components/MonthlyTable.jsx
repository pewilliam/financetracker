import { formatDateShort, formatMoney } from "../utils/format.js";

export default function MonthlyTable({
  days,
  summary,
  onAdd,
  onEdit,
  onDelete,
  invoicesById
}) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="sheet-table">
        <thead>
          <tr>
            <th className="sheet-head sheet-head-date">Data</th>
            <th className="sheet-head sheet-head-expense">Gasto</th>
            <th className="sheet-head sheet-head-income">Ganho</th>
            <th className="sheet-head sheet-head-balance">Saldo</th>
            <th className="sheet-head sheet-head-note">Observacao</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const tooltip = day.transactions
              .filter((tx) => tx.invoice_id)
              .map((tx) => {
                const invoice = invoicesById.get(tx.invoice_id);
                if (!invoice) {
                  return null;
                }
                const items = invoice.items
                  .map((item) => `${item.description}: ${formatMoney(item.amount)}`)
                  .join(" | ");
                return `${invoice.name} -> ${items}`;
              })
              .filter(Boolean)
              .join("\n");

            return (
              <tr
                key={day.date}
                className={`sheet-row ${day.has_future ? "table-row-future" : ""}`}
                title={tooltip}
              >
                <td className="sheet-cell cell-date">
                  {formatDateShort(day.date)}
                </td>
                <td className="sheet-cell cell-expense">
                  {day.expenses ? formatMoney(day.expenses) : "-"}
                </td>
                <td className="sheet-cell cell-income">
                  {day.income ? formatMoney(day.income) : "-"}
                </td>
                <td
                  className={`sheet-cell cell-balance ${
                    Number(day.balance) < 0 ? "cell-balance-negative" : ""
                  }`}
                >
                  {formatMoney(day.balance)}
                </td>
                <td className="sheet-cell cell-note">
                  <div className="note-stack">
                    {day.transactions.length ? (
                      day.transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="note-item"
                        >
                          <span className={tx.type === "expense" ? "chip chip-expense" : "chip chip-income"}>
                            {formatMoney(tx.amount)}
                          </span>
                          <span>
                            {tx.description || "Sem descricao"}
                          </span>
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => onEdit(tx)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-xs chip-expense"
                            onClick={() => onDelete(tx.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="note-empty">Sem lancamentos</span>
                    )}
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => onAdd(day.date)}
                    >
                      Adicionar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        {summary && (
          <tfoot>
            <tr className="sheet-total-row">
              <td className="pt-4">Totais</td>
              <td className="pt-4 cell-expense">
                {formatMoney(summary.total_expenses)}
              </td>
              <td className="pt-4 cell-income">
                {formatMoney(summary.total_income)}
              </td>
              <td className="pt-4 cell-balance">
                {formatMoney(summary.projected_closing)}
              </td>
              <td className="pt-4">
                <span className="mr-2">Diferenca:</span>
                <span
                  className={
                    Number(summary.difference) < 0
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }
                >
                  {formatMoney(summary.difference)}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
