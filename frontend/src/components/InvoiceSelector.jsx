import { useEffect, useMemo, useState } from "react";
import { formatDateShort } from "../utils/format.js";

const DEFAULT_INVOICE_COLOR = "#3B82F6";

function normalizeInvoiceColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color || "") ? color : DEFAULT_INVOICE_COLOR;
}

function formatMonthShortCompact(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const label = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "").replace(" de ", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function InvoiceSelector({ invoices = [], value = null, onChange }) {
  const sortedInvoices = useMemo(() => [...invoices].sort((a, b) => a.due_date.localeCompare(b.due_date)), [invoices]);
  const selectedInvoice = sortedInvoices.find((invoice) => String(invoice.id) === String(value?.invoiceId));
  const selectedTemplateId = String(value?.templateId || selectedInvoice?.template_id || selectedInvoice?.id || "");
  const [showTemplatePicker, setShowTemplatePicker] = useState(() => !selectedTemplateId);

  const templateOptions = useMemo(() => {
    const grouped = new Map();
    sortedInvoices.forEach((invoice) => {
      const templateId = String(invoice.template_id ?? invoice.id);
      const current = grouped.get(templateId);
      if (current) {
        current.invoices.push(invoice);
        current.count += 1;
        return;
      }
      grouped.set(templateId, {
        id: templateId,
        name: invoice.name,
        color: normalizeInvoiceColor(invoice.color),
        invoices: [invoice],
        count: 1
      });
    });
    return [...grouped.values()].sort((a, b) => (
      a.name.localeCompare(b.name, "pt-BR") ||
      a.invoices[0].due_date.localeCompare(b.invoices[0].due_date)
    ));
  }, [sortedInvoices]);

  const selectedTemplate = templateOptions.find((template) => template.id === selectedTemplateId) || null;
  const templateInvoices = selectedTemplate?.invoices || [];

  useEffect(() => {
    if (!templateOptions.length) {
      setShowTemplatePicker(false);
      return;
    }
    if (selectedTemplate) {
      setShowTemplatePicker(false);
      return;
    }
    if (templateOptions.length === 1) {
      const [onlyTemplate] = templateOptions;
      setShowTemplatePicker(false);
      if (!value?.invoiceId && onlyTemplate.invoices[0]) {
        onChange?.({ templateId: onlyTemplate.id, invoiceId: String(onlyTemplate.invoices[0].id) });
      }
      return;
    }
    setShowTemplatePicker(true);
  }, [selectedTemplate, templateOptions, value?.invoiceId]);

  const selectTemplate = (template) => {
    const currentInvoiceInTemplate = template.invoices.some((invoice) => String(invoice.id) === String(value?.invoiceId));
    setShowTemplatePicker(false);
    onChange?.({
      templateId: template.id,
      invoiceId: currentInvoiceInTemplate ? String(value.invoiceId) : String(template.invoices[0]?.id || "")
    });
  };

  const resetTemplateSelection = () => {
    setShowTemplatePicker(true);
    onChange?.(null);
  };

  const selectInvoice = (invoice) => {
    onChange?.({ templateId: String(invoice.template_id ?? invoice.id), invoiceId: String(invoice.id) });
  };

  return (
    <section className="installment-selector invoice-selector">
      <div className="installment-selector-head">
        <div>
          <span className="field-label">Fatura inicial</span>
          <strong>Escolha o template e o mês da 1ª parcela</strong>
        </div>
      </div>

      {(showTemplatePicker || !selectedTemplate) && (
        <div className="template-picker-grid">
          {templateOptions.map((template) => (
            <button
              key={template.id}
              className={`template-picker-card ${template.id === selectedTemplateId ? "active" : ""}`}
              type="button"
              style={{ "--template-color": template.color }}
              onClick={() => selectTemplate(template)}
            >
              <span className="template-picker-title">
                <i aria-hidden="true" />
                <strong>{template.name}</strong>
              </span>
              <small>{template.count} {template.count === 1 ? "fatura disponível" : "faturas disponíveis"}</small>
            </button>
          ))}
        </div>
      )}

      {selectedTemplate && !showTemplatePicker && (
        <div className="month-selector-panel">
          <div className="month-selector-summary">
            <span>Template selecionado:</span>
            <strong><i aria-hidden="true" style={{ "--template-color": selectedTemplate.color }} /> {selectedTemplate.name}</strong>
            {templateOptions.length > 1 && <button type="button" className="link-btn" onClick={resetTemplateSelection}>Trocar</button>}
          </div>
          <div className="month-selector-content">
            <span className="field-label">Mês inicial da 1ª parcela</span>
            <div className="month-chip-row" role="list" aria-label={`Faturas do template ${selectedTemplate.name}`}>
              {templateInvoices.map((invoice) => (
                <button
                  key={invoice.id}
                  className={`month-chip ${String(invoice.id) === String(value?.invoiceId) ? "active" : ""}`}
                  type="button"
                  style={{ "--template-color": selectedTemplate.color }}
                  onClick={() => selectInvoice(invoice)}
                >
                  <strong>{formatMonthShortCompact(invoice.due_date)}</strong>
                  <span>{formatDateShort(invoice.due_date)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
