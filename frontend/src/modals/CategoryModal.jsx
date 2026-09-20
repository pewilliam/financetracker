import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Tags, X } from "lucide-react";
import { isMobileViewport } from "../app/helpers.js";
import ColorPickerField, { normalizeColorValue } from "../components/ColorPickerField.jsx";

export default function CategoryModal({ category = null, onSave, onClose }) {
  const [name, setName] = useState(category?.name || "");
  const [color, setColor] = useState(normalizeColorValue(category?.color));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(category);
  const shouldAutoFocusName = !isMobileViewport();

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
      await onSave({ name: cleanName, color: normalizeColorValue(color) });
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
          <div className="field-label">
            <span>Nome da categoria</span>
            <input autoFocus={shouldAutoFocusName} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Alimentação, Transporte, Lazer..." />
            <small>Use um nome curto para facilitar a leitura no dashboard.</small>
          </div>

          <fieldset className="category-color-field">
            <legend>Cor de identificação</legend>
            <ColorPickerField value={color} onChange={setColor} disabled={saving} />
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
