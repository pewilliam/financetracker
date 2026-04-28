import { useState } from "react";
import { formatMoney } from "../utils/format.js";

export default function InvoiceCard({ invoice, onAddItem, onDeleteItem }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!description || !amount) {
      return;
    }
    onAddItem(invoice.id, { description, amount: Number(amount) });
    setDescription("");
    setAmount("");
  };

  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{invoice.name}</p>
          <p className="text-xs text-slate-500">Vence em {invoice.due_date}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total
          </p>
          <p className="text-lg font-semibold">{formatMoney(invoice.total_amount)}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs text-slate-600">
        {invoice.items.length ? (
          invoice.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <span>{item.description}</span>
              <span className="flex items-center gap-2">
                {formatMoney(item.amount)}
                <button
                  className="btn btn-xs chip-expense"
                  onClick={() => onDeleteItem(invoice.id, item.id)}
                >
                  Remover
                </button>
              </span>
            </li>
          ))
        ) : (
          <li className="text-slate-400">Sem itens ainda</li>
        )}
      </ul>

      <form className="mt-4 grid gap-2" onSubmit={handleSubmit}>
        <input
          className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/50"
          placeholder="Descricao do item"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <input
          className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/50"
          type="number"
          step="0.01"
          placeholder="Valor"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button className="btn btn-xs" type="submit">
          Adicionar item
        </button>
      </form>
    </div>
  );
}
