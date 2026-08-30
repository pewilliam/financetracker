import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Tags, X } from "lucide-react";


export const CATEGORY_COLORS = ["#14A078", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16"];


export default function CategoryModal({ suggestedColor = CATEGORY_COLORS[0], onSave, onClose }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(suggestedColor);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, saving]);

  const cleanName = name.trim();
  const submit = async (event) => {
    event.preventDefault();
    if (!cleanName || saving) return;
    setSaving(true);
    try {
      await onSave({ name: cleanName, color });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-layer category-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label="Fechar" />
      <form className="modal-card category-create-modal" onSubmit={submit}>
        <div className="category-modal-header">
          <div className="category-modal-icon"><Tags size={21} /></div>
          <div>
            <p className="eyebrow">Organização dos gastos</p>
            <h2>Nova categoria</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="category-modal-body">
          <label>
            <span>Nome da categoria</span>
            <input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Alimentação, Transporte, Lazer..." />
            <small>Use um nome curto para facilitar a leitura no dashboard.</small>
          </label>

          <fieldset>
            <legend>Cor de identificação</legend>
            <div className="category-color-options">
              {CATEGORY_COLORS.map((option) => (
                <button
                  className={color === option ? "active" : ""}
                  key={option}
                  type="button"
                  style={{ "--category-option-color": option }}
                  onClick={() => setColor(option)}
                  aria-label={`Selecionar cor ${option}`}
                >
                  {color === option && <Check size={15} />}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="category-preview">
            <span>Prévia</span>
            <strong style={{ "--category-color": color }}><i />{cleanName || "Nome da categoria"}</strong>
          </div>
        </div>

        <div className="category-modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" type="submit" disabled={!cleanName || saving}>
            {saving ? <><Loader2 className="spin" size={16} /> Criando...</> : "Criar categoria"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
