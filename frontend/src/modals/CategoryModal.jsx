import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Palette, Tags, X } from "lucide-react";


export const CATEGORY_COLORS = ["#14A078", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16"];

function normalizeColor(value, fallback = CATEGORY_COLORS[0]) {
  return /^#[0-9A-F]{6}$/i.test(value || "") ? value.toUpperCase() : fallback;
}

export default function CategoryModal({ category = null, suggestedColor = CATEGORY_COLORS[0], onSave, onClose }) {
  const [name, setName] = useState(category?.name || "");
  const [color, setColor] = useState(normalizeColor(category?.color, normalizeColor(suggestedColor)));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(category);

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
    event.stopPropagation();
    if (!cleanName || saving) return;
    setSaving(true);
    try {
      await onSave({ name: cleanName, color: normalizeColor(color) });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-layer category-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label="Fechar" />
      <form className="modal-card wallet-modal wallet-editor-modal category-create-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <div className="wallet-transfer-header">
          <i><Tags size={20} /></i>
          <div>
            <small>{editing ? "CONFIGURAÇÃO DA CATEGORIA" : "ORGANIZAÇÃO FINANCEIRA"}</small>
            <h2 id="category-modal-title">{editing ? "Editar categoria" : "Nova categoria"}</h2>
            <p>{editing ? "Atualize o nome e a identificação visual." : "Crie uma identificação clara para seus lançamentos."}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="wallet-modal-body form-stack category-modal-body">
          <label>
            <span>Nome da categoria</span>
            <input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Alimentação, Transporte, Lazer..." />
            <small>Use um nome curto para facilitar a leitura no dashboard.</small>
          </label>

          <fieldset className="category-color-field">
            <legend>Cor de identificação</legend>
            <label className="category-custom-color">
              <input type="color" value={normalizeColor(color)} onChange={(event) => setColor(event.target.value.toUpperCase())} aria-label="Escolher uma cor personalizada" />
              <span><strong>Cor personalizada</strong><small>{normalizeColor(color)}</small></span>
              <Palette size={18} />
            </label>
            <small className="category-color-hint">Escolha qualquer cor ou use uma das sugestões abaixo.</small>
            <div className="category-color-options">
              {CATEGORY_COLORS.map((option) => (
                <button
                  className={color === option ? "active" : ""}
                  key={option}
                  type="button"
                  style={{ "--category-option-color": option }}
                  onClick={() => setColor(option)}
                  aria-label={`Selecionar cor ${option}`}
                  aria-pressed={color === option}
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

        <footer className="wallet-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" type="submit" disabled={!cleanName || saving}>
            {saving ? <><Loader2 className="spin" size={16} /> Salvando...</> : editing ? "Salvar alterações" : "Criar categoria"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
