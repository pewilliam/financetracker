import { useEffect, useState } from "react";

export default function TransactionForm({ open, initial, date, onClose, onSave }) {
  const [form, setForm] = useState({
    date: date || "",
    type: "expense",
    amount: "",
    description: "",
    is_future: false,
    recurrence: false,
    day_of_month: ""
  });

  useEffect(() => {
    if (initial) {
      setForm({
        date: initial.date,
        type: initial.type,
        amount: initial.amount,
        description: initial.description || "",
        is_future: initial.is_future,
        recurrence: false,
        day_of_month: ""
      });
    } else {
      setForm((prev) => ({
        ...prev,
        date: date || prev.date,
        amount: "",
        description: "",
        is_future: false
      }));
    }
  }, [initial, date]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.date || !form.amount) {
      return;
    }

    const payload = {
      data: {
        date: form.date,
        type: form.type,
        amount: Number(form.amount),
        description: form.description,
        is_future: form.is_future
      },
      recurrence: form.recurrence
        ? { enabled: true, day_of_month: Number(form.day_of_month || 1) }
        : null
    };

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="glass-card w-full max-w-md rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {initial ? "Editar lancamento" : "Novo lancamento"}
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>
            Fechar
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
            type="date"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
          />
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            <option value="expense">Gasto</option>
            <option value="income">Ganho</option>
          </select>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
            type="number"
            step="0.01"
            placeholder="Valor"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
            placeholder="Descricao"
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={form.is_future}
              onChange={(event) =>
                setForm({ ...form, is_future: event.target.checked })
              }
            />
            Lancamento futuro
          </label>
          {!initial && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={form.recurrence}
                  onChange={(event) =>
                    setForm({ ...form, recurrence: event.target.checked })
                  }
                />
                Recorrente mensal
              </label>
              {form.recurrence && (
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Dia do mes"
                  value={form.day_of_month}
                  onChange={(event) =>
                    setForm({ ...form, day_of_month: event.target.value })
                  }
                />
              )}
            </div>
          )}
          <button className="btn btn-primary w-full" type="submit">
            Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
