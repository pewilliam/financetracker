import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Plus, Save, Target, Trash2, X } from "lucide-react";
import { formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

function initialLimit(category, language) {
  if (category?.monthly_limit === null || category?.monthly_limit === undefined) return "";
  return Number(category.monthly_limit).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CategoryLimitModal({ categories, category = null, language, t, onSave, onRemove, onClose }) {
  const editing = Boolean(category);
  const [categoryId, setCategoryId] = useState(() => String(category?.id ?? categories[0]?.id ?? ""));
  const [limit, setLimit] = useState(() => initialLimit(category, language));
  const [busyAction, setBusyAction] = useState(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === categoryId),
    [categories, categoryId],
  );
  const parsedLimit = parseTypedMoneyInput(limit, language);
  const busy = Boolean(busyAction);
  const canSubmit = Boolean(selectedCategory) && parsedLimit > 0 && !busy;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || busy) return;
      if (confirmingRemove) setConfirmingRemove(false);
      else onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, confirmingRemove, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusyAction("save");
    try {
      await onSave(selectedCategory.id, parsedLimit);
      onClose();
    } finally {
      setBusyAction(null);
    }
  };

  const remove = async () => {
    if (!selectedCategory || !onRemove || busy) return;
    setBusyAction("remove");
    try {
      await onRemove(selectedCategory.id);
      onClose();
    } finally {
      setBusyAction(null);
    }
  };

  return createPortal(
    <div className="modal-layer wallet-modal-layer category-limit-modal-layer">
      <button className="modal-backdrop" type="button" onClick={busy ? undefined : onClose} aria-label={t("actions.cancel")} />
      <form className="modal-card wallet-modal wallet-editor-modal category-limit-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="category-limit-title">
        <div className="wallet-transfer-header">
          <i><Target size={20} /></i>
          <div>
            <small>{t("categories.limitsEyebrow")}</small>
            <h2 id="category-limit-title">{editing ? t("categories.editLimit") : t("categories.newLimit")}</h2>
            <p>{editing ? t("categories.editLimitHint") : t("categories.newLimitHint")}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={busy} aria-label={t("actions.cancel")}><X size={18} /></button>
        </div>

        <div className={`wallet-modal-body form-stack category-limit-modal-body ${confirmingRemove ? "confirming-remove" : ""}`}>
          {confirmingRemove ? <div className="category-limit-remove-confirm"><i><AlertTriangle size={21} /></i><div><strong>{t("categories.confirmRemoveLimitTitle")}</strong><p>{t("categories.confirmRemoveLimitMessage", { name: selectedCategory?.name || "" })}</p></div></div> : <>
            {editing ? <div className="category-limit-category"><i style={{ "--category-color": selectedCategory?.color }}><Target size={17} /></i><div><span>{t("categories.chooseCategory")}</span><strong>{selectedCategory?.name}</strong></div></div> : <label>
              <span>{t("categories.chooseCategory")}</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={busy}>
                {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>}
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
                  disabled={busy}
                />
              </span>
              <small>{t("categories.limitRepeatsHint")}</small>
            </label>
            {editing && <button className="category-limit-remove" type="button" onClick={() => setConfirmingRemove(true)} disabled={busy}><Trash2 size={16} /> {t("categories.removeLimit")}</button>}
          </>}
        </div>

        <footer className="wallet-modal-actions">
          {confirmingRemove ? <>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmingRemove(false)} disabled={busy}>{t("categories.keepLimit")}</button>
            <button className="btn btn-primary danger-action" type="button" onClick={remove} disabled={busy}>{busyAction === "remove" ? <><Loader2 className="spin" size={16} /> {t("categories.removingLimit")}</> : <><Trash2 size={16} /> {t("categories.confirmRemove")}</>}</button>
          </> : <>
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>{t("actions.cancel")}</button>
            <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
              {busyAction === "save" ? <><Loader2 className="spin" size={16} /> {t("categories.savingLimit")}</> : editing ? <><Save size={16} /> {t("categories.saveLimit")}</> : <><Plus size={16} /> {t("categories.confirmAdd")}</>}
            </button>
          </>}
        </footer>
      </form>
    </div>,
    document.body,
  );
}
