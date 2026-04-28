import { useState } from "react";
import { CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { daysUntil, formatMoney, parseMoneyInput } from "../utils/format.js";

export default function InvoiceCard({ invoice, onAddItem, onDeleteItem, onTogglePaid }) {
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const status = daysUntil(invoice.due_date);
  const overdue = !invoice.paid && (status === "Vencida" || status === "Vence hoje");

  const handleSubmit = (event) => {
    event.preventDefault();
    const parsed = parseMoneyInput(amount);
    if (!description || !parsed) return;
    onAddItem(invoice.id, { description, amount: parsed });
    setDescription("");
    setAmount("");
    setAdding(false);
  };

  return (
    <article className={`invoice-card card ${invoice.paid ? "paid" : ""}`}>
      <header className="invoice-header">
        <div>
          <h3>{invoice.name}</h3>
          <p>Vencimento em {new Date(invoice.due_date).toLocaleDateString()}</p>
        </div>
        <span className={`due-badge ${invoice.paid ? "paid" : overdue ? "danger" : ""}`}>
          {invoice.paid ? "Paga" : status}
        </span>
      </header>

      <div className="invoice-items">
        {invoice.items.length ? invoice.items.map((item) => (
          <div className="invoice-item" key={item.id}>
            <span>{item.description}</span>
            <strong>{formatMoney(item.amount)}</strong>
            <button className="icon-btn small danger" onClick={() => onDeleteItem(invoice.id, item.id)} aria-label="Remover item">
              <Trash2 size={15} />
            </button>
          </div>
        )) : <p className="muted">Sem itens ainda.</p>}
      </div>

      {adding ? (
        <form className="inline-form" onSubmit={handleSubmit}>
          <input placeholder="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} />
          <input inputMode="numeric" placeholder="R$ 0,00" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <button className="btn btn-primary" type="submit">Adicionar</button>
        </form>
      ) : (
        <button className="add-inline" onClick={() => setAdding(true)}>
          <Plus size={16} /> item
        </button>
      )}

      <footer className="invoice-footer">
        <span>Total</span>
        <strong>{formatMoney(invoice.total_amount)}</strong>
      </footer>
      <div className="invoice-actions">
        <button className={`btn ${invoice.paid ? "btn-ghost" : "btn-primary"}`} onClick={() => onTogglePaid(invoice.id, !invoice.paid)}>
          {invoice.paid ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
          {invoice.paid ? "Marcar pendente" : "Marcar paga"}
        </button>
      </div>
    </article>
  );
}
