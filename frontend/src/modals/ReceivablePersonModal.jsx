import { useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";

export default function ReceivablePersonModal({ person = null, initialName = "", onSubmit, onClose }) {
  const { language } = useI18n();
  const [name, setName] = useState(person?.name || initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(person);

  useEffect(() => {
    setName(person?.name || initialName);
    setError("");
  }, [person, initialName]);

  const submit = async (event) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ name: normalizedName });
    } catch (submitError) {
      setError(
        submitError?.status === 409
          ? (language === "en-US" ? "A person with this name already exists." : "Já existe uma pessoa com este nome.")
          : (language === "en-US" ? "Could not save this person." : "Não foi possível salvar esta pessoa.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer receivable-action-layer receivable-person-layer">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"} />
      <form className="modal-card invoice-modal receivable-person-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="receivable-person-modal-title">
        <header className="transaction-entry-titlebar compact">
          <span className="transaction-entry-icon"><UserRound size={21} /></span>
          <div className="transaction-entry-heading">
            <p>{language === "en-US" ? "PEOPLE" : "PESSOAS"}</p>
            <h2 id="receivable-person-modal-title">
              {editing
                ? (language === "en-US" ? "Edit person" : "Editar pessoa")
                : (language === "en-US" ? "New person" : "Nova pessoa")}
            </h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={language === "en-US" ? "Close modal" : "Fechar modal"}>
            <X size={18} />
          </button>
        </header>
        <div className="invoice-modal-body receivable-person-form">
          <p className="receivable-person-form-hint">
            {language === "en-US"
              ? "Use the name you want to see when organizing receivables."
              : "Use o nome que você deseja visualizar na organização dos recebíveis."}
          </p>
          <label className="field-label">
            <span>{language === "en-US" ? "Full name" : "Nome completo"}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              autoFocus
              required
              placeholder={language === "en-US" ? "e.g. Maria Silva" : "Ex.: Maria Silva"}
            />
          </label>
          {error && <p className="receivable-person-form-error" role="alert">{error}</p>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            {language === "en-US" ? "Cancel" : "Cancelar"}
          </button>
          <button className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving
              ? (language === "en-US" ? "Saving..." : "Salvando...")
              : (language === "en-US" ? "Save" : "Salvar")}
          </button>
        </div>
      </form>
    </div>
  );
}
