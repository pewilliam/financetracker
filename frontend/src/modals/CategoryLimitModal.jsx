import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, Target, X } from "lucide-react";
import { formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function CategoryLimitModal({ categories, language, t, onSave, onClose }) {
  const [categoryId, setCategoryId] = useState(() => String(categories[0]?.id ?? ""));
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === categoryId),
    [categories, categoryId],
  );
  const parsedLimit = parseTypedMoneyInput(limit, language);
  const canSubmit = Boolean(selectedCategory) && parsedLimit > 0 && !saving;

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

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSave(selectedCategory.id, parsedLimit);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-layer wallet-modal-layer category-limit-modal-layer">
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label={t("actions.cancel")} />
      <form className="modal-card wallet-modal wallet-editor-modal category-limit-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="category-limit-title">
        <div className="wallet-transfer-header">
          <i><Target size={20} /></i>
          <div>
            <small>{t("categories.limitsEyebrow")}</small>
            <h2 id="category-limit-title">{t("categories.newLimit")}</h2>
            <p>{t("categories.newLimitHint")}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving} aria-label={t("actions.cancel")}><X size={18} /></button>
        </div>

        <div className="wallet-modal-body form-stack category-limit-modal-body">
          <label>
            <span>{t("categories.chooseCategory")}</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={saving}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            <span>{t("categories.monthlyLimit")}</span>
            <span className="category-limit-money-field">
              <b>R$</b>
              <input
                inputMode="decimal"
                aria-label={t("categories.monthlyLimit")}
                placeholder="0,00"
                value={limit}
                onChange={(event) => setLimit(formatTypedMoneyForEditing(event.target.value, language))}
                disabled={saving}
              />
            </span>
            <small>{t("categories.limitRepeatsHint")}</small>
          </label>
        </div>

        <footer className="wallet-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>{t("actions.cancel")}</button>
          <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
            {saving ? <><Loader2 className="spin" size={16} /> {t("categories.savingLimit")}</> : <><Plus size={16} /> {t("categories.confirmAdd")}</>}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
