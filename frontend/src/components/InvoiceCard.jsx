import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, CheckCircle2, CreditCard, Plus, RotateCcw, Trash2 } from "lucide-react";
import { daysUntil, formatDateShort, formatMoney, parseMoneyInput } from "../utils/format.js";

function invoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : "#3B82F6";
}

export default function InvoiceCard({ invoice, onAddItem, onAddInstallment, onDeleteItem, onDeleteInstallmentItem, onTogglePaid, onDuplicateNext, onViewInstallment }) {
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
    <article className={`invoice-card card ${invoice.paid ? "paid" : ""}`} style={{ "--invoice-color": invoiceColor(invoice.color) }}>
      <header className="invoice-header">
        <div>
          <h3><span className="invoice-color-dot" />{invoice.name}</h3>
          <p>Vencimento em {formatDateShort(invoice.due_date)}</p>
        </div>
        <span className={`due-badge ${invoice.paid ? "paid" : overdue ? "danger" : ""}`}>
          {invoice.paid ? "Paga" : status}
        </span>
      </header>

      <div className="invoice-items">
        {invoice.items.length || invoice.installment_items?.length ? (
          <>
            {invoice.items.map((item) => (
              <div className="invoice-item" key={`item-${item.id}`}>
                <span>{item.description}</span>
                <strong>{formatMoney(item.amount)}</strong>
                <button className="icon-btn small danger" onClick={() => onDeleteItem(invoice.id, item.id)} aria-label="Remover item">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {(invoice.installment_items || []).map((item) => (
              <div
                className="invoice-item installment-line"
                key={`installment-${item.id}`}
                title={`Compra: ${formatMoney(item.purchase_total_amount)} em ${item.installment_count}x - parcelas restantes: ${item.remaining_installments}`}
              >
                <span><CreditCard size={15} /> {item.purchase_description || item.description}<em>PARCELA</em></span>
                <strong>{formatMoney(item.amount)} <small>({item.installment_number}/{item.installment_count})</small></strong>
                <button className="icon-btn small danger" onClick={() => onDeleteInstallmentItem(item.id)} aria-label="Remover parcela">
                  <Trash2 size={15} />
                </button>
                <button className="installment-link" onClick={() => onViewInstallment(item.purchase_id)}>Ver todas as parcelas →</button>
              </div>
            ))}
          </>
        ) : <p className="muted">Sem itens ainda.</p>}
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
      <div className="invoice-template-footer">
        <Link to={`/modelos-de-fatura#template-${invoice.template_id}`}>Modelo: {invoice.name} →</Link>
      </div>
      <div className="invoice-actions">
        <button className="btn btn-ghost" onClick={() => onDuplicateNext(invoice)}>
          <CalendarPlus size={16} />
          Próxima fatura
        </button>
        <button className="btn btn-ghost" onClick={() => onAddInstallment(invoice)}>
          <CreditCard size={16} />
          + Parcela
        </button>
        <button className={`btn ${invoice.paid ? "btn-ghost" : "btn-primary"}`} onClick={() => onTogglePaid(invoice.id, !invoice.paid)}>
          {invoice.paid ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
          {invoice.paid ? "Marcar pendente" : "Marcar paga"}
        </button>
      </div>
    </article>
  );
}
