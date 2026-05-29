import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Plus, Power, RotateCcw, Trash2 } from "lucide-react";
import InvoiceTemplateModal from "../modals/InvoiceTemplateModal.jsx";
import { useI18n } from "../i18n/index.ts";
import { defaultTemplateForm, normalizeInvoiceColor } from "../app/helpers.js";

export default function InvoiceTemplatesPage({ templates, onSave, onToggle, onDelete }) {
  const location = useLocation();
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace("#template-", "");
    const target = document.getElementById(`template-${id}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [location.hash, templates]);

  const saveTemplate = async (payload) => {
    try {
      await onSave(payload, editingTemplate?.id || null);
      toast.success(editingTemplate ? "Modelo atualizado" : "Modelo criado");
      setEditingTemplate(null);
    } catch {
      toast.error("Erro ao salvar modelo");
    }
  };

  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">{tt("invoiceModels.title", "Modelos de fatura")}</p><h2>{tt("invoiceModels.manage", "Gerenciar modelos")}</h2></div>
        <button className="btn btn-primary" onClick={() => setEditingTemplate(defaultTemplateForm())}><Plus size={16} /> {tt("invoiceModels.newModel", "Novo modelo")}</button>
      </div>
      <div className="template-list card">
        {templates.length ? templates.map((template) => (
          <div className={`template-row ${template.active ? "" : "inactive"}`} id={`template-${template.id}`} key={template.id}>
            <span className="template-dot" style={{ "--invoice-color": normalizeInvoiceColor(template.color) }} />
            <strong>{template.name}</strong>
            {!template.active && <span className="inactive-badge">INATIVO</span>}
            <span>{tt("invoiceModels.dueOnDay", "Vence dia")} {template.default_due_day}</span>
            <span>{template.total_invoices} {template.total_invoices === 1 ? tt("invoiceModels.invoice", "fatura") : tt("invoiceModels.invoices", "faturas")}</span>
            <span>{template.pending_invoices} {tt("invoiceModels.pendingAbbr", "pend.")}</span>
            <div className="template-actions">
              <button className="btn btn-ghost compact" onClick={() => setEditingTemplate(template)}>{tt("invoiceModels.edit", "Editar")}</button>
              <button className="btn btn-ghost compact" onClick={() => onToggle(template)}>
                {template.active ? <Power size={15} /> : <RotateCcw size={15} />}
                {template.active ? tt("invoiceModels.disable", "Desativar") : tt("invoiceModels.reactivate", "Reativar")}
              </button>
              {!template.active && template.pending_invoices === 0 && template.total_invoices === 0 && (
                <button className="btn btn-ghost compact danger-text" onClick={() => onDelete(template)}><Trash2 size={15} /> {tt("invoiceModels.delete", "Excluir")}</button>
              )}
            </div>
          </div>
        )) : (
          <div className="empty-state"><div className="empty-illustration">+</div><h3>Nenhum modelo cadastrado.</h3><p>Crie um modelo para usar nas próximas faturas.</p></div>
        )}
      </div>
      {editingTemplate && (
        <InvoiceTemplateModal
          initial={editingTemplate.id ? editingTemplate : null}
          onClose={() => setEditingTemplate(null)}
          onSubmit={saveTemplate}
        />
      )}
    </section>
  );
}


