import { Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";

export default function DeleteCategoryModal({ category, onClose, onConfirm }) {
  const { t, language } = useI18n();
  const tt = (key, pt) => language === "en-US" ? t(key) : pt;

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={tt("actions.cancel", "Cancelar")} />
      <div className="modal-card template-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-category-title">
        <div className="modal-titlebar">
          <div className="modal-icon danger"><Trash2 size={22} /></div>
          <div>
            <p className="eyebrow">{tt("settings.categories", "Categorias")}</p>
            <h2 id="delete-category-title">{tt("settings.deleteCategory", "Excluir categoria")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>

        <div className="confirm-modal-body">
          <p>{tt("settings.deleteCategoryMessage", "Deseja realmente excluir esta categoria? Os lançamentos vinculados serão preservados e passarão a ficar sem categoria.")}</p>
          <div className="category-delete-context">
            <i style={{ "--category-color": category.color }} />
            <strong>{category.name}</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{tt("actions.cancel", "Cancelar")}</button>
          <button className="btn btn-primary danger-action" type="button" onClick={onConfirm}><Trash2 size={16} /> {tt("actions.delete", "Excluir")}</button>
        </div>
      </div>
    </div>
  );
}
