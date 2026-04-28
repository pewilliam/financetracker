import { useEffect, useState } from "react";
import IMask from "imask";
import { X } from "lucide-react";
import { parseMoneyInput } from "../utils/format.js";

export default function TransactionForm({
  open,
  initial,
  date,
  invoices = [],
  onClose,
  onSave
}) {
  const [form, setForm] = useState({
    date: date || "",
    type: "expense",
    amount: "",
    description: "",
    is_future: false,
    invoice_id: "",
    recurrence: false,
    day_of_month: ""
  });

  useEffect(() => {
    if (initial) {
      setForm({
        date: initial.date,
        type: initial.type,
        amount: Number(initial.amount).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        }),
        description: initial.description || "",
        is_future: initial.is_future,
        invoice_id: initial.invoice_id || "",
        recurrence: false,
        day_of_month: ""
      });
    } else {
      setForm({
        date: date || "",
        type: "expense",
        amount: "",
        description: "",
        is_future: false,
        invoice_id: "",
        recurrence: false,
        day_of_month: ""
      });
    }
  }, [initial, date, open]);

  const handleAmount = (value) => {
    const number = parseMoneyInput(value);
    const mask = IMask.createMask({
      mask: "R$ num",
      blocks: {
        num: {
          mask: Number,
          scale: 2,
          thousandsSeparator: ".",
          radix: ",",
          padFractionalZeros: true,
          normalizeZeros: true
        }
      }
    });
    mask.resolve(number ? number.toFixed(2).replace(".", ",") : "");
    setForm({ ...form, amount: number ? mask.value : "" });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const amount = parseMoneyInput(form.amount);
    if (!form.date || !amount) return;

    onSave({
      data: {
        date: form.date,
        type: form.type,
        amount,
        description: form.description,
        is_future: form.is_future,
        invoice_id: form.invoice_id ? Number(form.invoice_id) : null
      },
      recurrence: form.recurrence
        ? { enabled: true, day_of_month: Number(form.day_of_month || 1) }
        : null
    });
  };

  return (
    <div className={`drawer-layer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Fechar" />
      <aside className="drawer-panel">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Lançamento</p>
            <h2>{initial ? "Editar lançamento" : "Novo lançamento"}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>Data</span>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </label>

          <div>
            <span className="field-label">Tipo</span>
            <div className="segmented">
              <button type="button" className={form.type === "expense" ? "active danger" : ""} onClick={() => setForm({ ...form, type: "expense" })}>
                GASTO
              </button>
              <button type="button" className={form.type === "income" ? "active success" : ""} onClick={() => setForm({ ...form, type: "income" })}>
                GANHO
              </button>
            </div>
          </div>

          <label>
            <span>Valor</span>
            <input inputMode="numeric" placeholder="R$ 0,00" value={form.amount} onChange={(event) => handleAmount(event.target.value)} />
          </label>

          <label>
            <span>Descrição</span>
            <input placeholder="Ex: mercado, salário, aluguel" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={form.is_future} onChange={(event) => setForm({ ...form, is_future: event.target.checked })} />
            <span>É uma fatura futura?</span>
          </label>

          {form.is_future && (
            <label>
              <span>Fatura</span>
              <select value={form.invoice_id} onChange={(event) => setForm({ ...form, invoice_id: event.target.value })}>
                <option value="">Sem fatura vinculada</option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>{invoice.name}</option>
                ))}
              </select>
            </label>
          )}

          {!initial && (
            <>
              <label className="toggle-row">
                <input type="checkbox" checked={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.checked })} />
                <span>Lançamento recorrente?</span>
              </label>
              {form.recurrence && (
                <label>
                  <span>Dia do mês</span>
                  <input type="number" min="1" max="31" value={form.day_of_month} onChange={(event) => setForm({ ...form, day_of_month: event.target.value })} />
                </label>
              )}
            </>
          )}

          <div className="drawer-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" type="submit">Salvar</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
