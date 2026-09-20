import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CreditCard, Loader2, Pencil, X } from "lucide-react";
import FilterSelect from "../components/common/FilterSelect.jsx";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { useI18n } from "../i18n/index.ts";
import { invoiceAcceptsNewCharges, isMobileViewport, normalizeInvoiceColor } from "../app/helpers.js";
import { formatDateShort, formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

const cents = (value) => Math.round(Math.abs(Number(value || 0)) * 100);

function itemStatusLabel(item, invoice, copy) {
  if (item.status === "refunded") return copy("Reembolsada", "Refunded");
  if (item.status === "canceled") return copy("Cancelada", "Canceled");
  if (invoice?.paid) return copy("Paga", "Paid");
  if (!invoice) return copy("Sem fatura", "No invoice");
  if (invoice.due_date < new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)) {
    return copy("Atrasada", "Overdue");
  }
  return copy("Pendente", "Pending");
}

export default function EditInstallmentItemModal({
  purchase,
  item,
  invoices = [],
  allowOverdueInvoiceEdits = false,
  onSave,
  onClose,
}) {
  const { language } = useI18n();
  const copy = (pt, en) => (language === "en-US" ? en : pt);
  const amountInputRef = useRef(null);
  const original = {
    amount: Number(item.amount || 0),
    invoice_id: item.invoice_id ? String(item.invoice_id) : "",
    status: item.status || "pending",
  };
  const [form, setForm] = useState(() => ({
    amount: formatMoney(original.amount, language),
    invoice_id: original.invoice_id,
    status: original.status,
  }));
  const [saving, setSaving] = useState(false);

  const invoicesById = useMemo(() => new Map(invoices.map((invoice) => [String(invoice.id), invoice])), [invoices]);

  const invoiceOptions = useMemo(() => {
    const openInvoices = [...invoices]
      .filter((invoice) => invoiceAcceptsNewCharges(invoice, allowOverdueInvoiceEdits))
      .sort((left, right) => left.due_date.localeCompare(right.due_date) || left.name.localeCompare(right.name, language));

    const options = [
      {
        value: "",
        label: copy("Sem fatura", "No invoice"),
        description: copy("Parcela sem vínculo", "Unlinked installment"),
        color: "var(--muted)",
      },
      ...openInvoices.map((invoice) => ({
        value: String(invoice.id),
        label: invoice.name,
        description: copy(`Vence ${formatDateShort(invoice.due_date, language)}`, `Due ${formatDateShort(invoice.due_date, language)}`),
        searchText: `${invoice.name} ${invoice.due_date}`,
        color: normalizeInvoiceColor(invoice.color),
      })),
    ];

    const currentId = form.status === "canceled" ? "" : form.invoice_id;
    const currentInvoice = currentId ? invoicesById.get(String(currentId)) : null;
    if (currentInvoice && !options.some((option) => option.value === String(currentInvoice.id))) {
      options.splice(1, 0, {
        value: String(currentInvoice.id),
        label: currentInvoice.name,
        description: currentInvoice.paid
          ? copy(`Paga · venceu ${formatDateShort(currentInvoice.due_date, language)}`, `Paid · due ${formatDateShort(currentInvoice.due_date, language)}`)
          : copy(`Vence ${formatDateShort(currentInvoice.due_date, language)}`, `Due ${formatDateShort(currentInvoice.due_date, language)}`),
        searchText: `${currentInvoice.name} ${currentInvoice.due_date}`,
        color: normalizeInvoiceColor(currentInvoice.color),
      });
    }

    return options;
  }, [allowOverdueInvoiceEdits, form.invoice_id, form.status, invoices, invoicesById, language]);

  const selectedInvoice = form.status === "canceled" ? null : invoicesById.get(String(form.invoice_id));
  const amount = parseTypedMoneyInput(form.amount, language);
  const changed = cents(amount) !== cents(original.amount)
    || (form.status === "canceled" ? "" : form.invoice_id) !== original.invoice_id
    || form.status !== original.status;
  const invalidRefund = form.status === "refunded" && !form.invoice_id;
  const invalidInvoice = Boolean(form.invoice_id) && !selectedInvoice && form.status !== "canceled";
  const canSave = amount > 0 && changed && !invalidRefund && !invalidInvoice && !saving;
  const invoiceDisabled = form.status === "canceled" || saving;

  useModalLifecycle({
    onClose,
    busy: saving,
    initialFocusRef: amountInputRef,
    autoFocus: !isMobileViewport(),
  });

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        amount,
        invoice_id: form.status === "canceled" ? null : form.invoice_id ? Number(form.invoice_id) : null,
        status: form.status || "pending",
      });
      onClose();
    } catch {
      // O AppShell exibe o erro e mantém o modal aberto para nova tentativa.
    } finally {
      setSaving(false);
    }
  };

  const title = copy(
    `Parcela ${item.installment_number} de ${purchase.installment_count}`,
    `Installment ${item.installment_number} of ${purchase.installment_count}`,
  );

  return createPortal(
    <div className="modal-layer edit-installment-item-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={copy("Fechar", "Close")} />
      <form
        className="modal-card transaction-modal invoice-entry-modal edit-installment-item-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-installment-item-title"
      >
        <header className="transaction-entry-titlebar invoice-entry-titlebar edit-installment-item-titlebar">
          <span className="transaction-entry-icon"><Pencil size={20} /></span>
          <div className="transaction-entry-heading">
            <p>{copy("EDITAR PARCELA", "EDIT INSTALLMENT")}</p>
            <h2 id="edit-installment-item-title">{title}</h2>
            <div className="edit-installment-item-meta">
              <span className="edit-installment-item-purchase" title={purchase.description}>
                <CreditCard size={12} />
                {purchase.description}
              </span>
              <em>{itemStatusLabel(item, item.invoice, copy)}</em>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={copy("Fechar", "Close")}>
            <X size={18} />
          </button>
        </header>

        <div className="transaction-modal-body invoice-entry-modal-body edit-installment-item-body">
          <div className="amount-field">
            <span>{copy("Valor", "Amount")}</span>
            <div className="money-input danger">
              <span>R$</span>
              <input
                ref={amountInputRef}
                inputMode="decimal"
                value={form.amount.replace(/^R\$\s?/, "")}
                onChange={(event) => setForm((current) => ({ ...current, amount: formatTypedMoneyForEditing(event.target.value, language) }))}
                onBlur={() => setForm((current) => ({ ...current, amount: formatTypedMoneyAsCurrency(current.amount, language) }))}
                onFocus={(event) => event.target.select()}
                aria-label={copy(`Valor da parcela ${item.installment_number}`, `Amount for installment ${item.installment_number}`)}
              />
            </div>
          </div>

          <div className={`edit-installment-field edit-installment-invoice ${invoiceDisabled ? "is-disabled" : ""}`}>
            <span>{copy("Fatura", "Invoice")}</span>
            <FilterSelect
              value={form.status === "canceled" ? "" : form.invoice_id}
              options={invoiceOptions}
              disabled={invoiceDisabled}
              searchable
              searchPlaceholder={copy("Buscar fatura em aberto...", "Search open invoice...")}
              emptyLabel={copy("Nenhuma fatura em aberto encontrada.", "No open invoices found.")}
              ariaLabel={copy(`Fatura da parcela ${item.installment_number}`, `Invoice for installment ${item.installment_number}`)}
              onChange={(invoiceId) => setForm((current) => ({ ...current, invoice_id: invoiceId }))}
            />
          </div>

          <div className="edit-installment-due" aria-live="polite">
            <span>{copy("Vencimento", "Due date")}</span>
            <strong>{selectedInvoice?.due_date ? formatDateShort(selectedInvoice.due_date, language) : "—"}</strong>
          </div>

          <div className="edit-installment-field">
            <span>{copy("Status", "Status")}</span>
            <select
              aria-label={copy(`Status da parcela ${item.installment_number}`, `Status for installment ${item.installment_number}`)}
              value={form.status || "pending"}
              disabled={saving}
              onChange={(event) => {
                const nextStatus = event.target.value;
                setForm((current) => ({
                  ...current,
                  status: nextStatus,
                  invoice_id: nextStatus === "canceled" ? "" : current.invoice_id,
                }));
              }}
            >
              <option value="pending">{copy("Pendente", "Pending")}</option>
              <option value="refunded">{copy("Reembolsada", "Refunded")}</option>
              <option value="canceled">{copy("Cancelada", "Canceled")}</option>
            </select>
          </div>

          {invalidRefund && (
            <p className="edit-installment-hint error" role="alert">
              {copy("Uma parcela reembolsada precisa estar vinculada a uma fatura.", "A refunded installment must be linked to an invoice.")}
            </p>
          )}
          {form.status === "canceled" && (
            <p className="edit-installment-hint">
              {copy("Parcelas canceladas ficam sem fatura associada.", "Canceled installments are left without an invoice.")}
            </p>
          )}
        </div>

        <footer className="transaction-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            {copy("Cancelar", "Cancel")}
          </button>
          <button className="btn btn-primary transaction-save" type="submit" disabled={!canSave}>
            {saving
              ? <><Loader2 className="spin" size={16} /> {copy("Salvando...", "Saving...")}</>
              : copy("Salvar alterações", "Save changes")}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
