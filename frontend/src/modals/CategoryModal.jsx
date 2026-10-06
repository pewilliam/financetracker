import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleDollarSign, EyeOff, Loader2, Tags, X } from "lucide-react";
import { isMobileViewport } from "../app/helpers.js";
import ColorPickerField, { normalizeColorValue } from "../components/ColorPickerField.jsx";
import { useI18n } from "../i18n/index.ts";

export default function CategoryModal({ category = null, onSave, onClose, layerClassName = "" }) {
  const { t, language } = useI18n();
  const tt = (key, pt) => language === "en-US" ? t(key) : pt;
  const [name, setName] = useState(category?.name || "");
  const [color, setColor] = useState(normalizeColorValue(category?.color));
  const [ignoreInCategoryAnalysis, setIgnoreInCategoryAnalysis] = useState(Boolean(category?.ignore_in_category_analysis));
  const [includeInIncomePlanning, setIncludeInIncomePlanning] = useState(Boolean(category?.include_in_income_planning));
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
      await onSave({
        name: cleanName,
        color: normalizeColorValue(color),
        ignore_in_category_analysis: ignoreInCategoryAnalysis,
        include_in_income_planning: includeInIncomePlanning,
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`modal-layer category-modal-layer ${layerClassName}`}>
      <button className="modal-backdrop" type="button" onClick={saving ? undefined : onClose} aria-label="Fechar" />
      <form className="modal-card wallet-modal wallet-editor-modal category-create-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <div className="wallet-transfer-header">
          <i><Tags size={20} /></i>
          <div>
            <small>{editing ? "CONFIGURAÇÃO DA CATEGORIA" : "ORGANIZAÇÃO FINANCEIRA"}</small>
            <h2 id="category-modal-title">{editing ? "Editar categoria" : "Nova categoria"}</h2>
            <p>{editing ? "Atualize a identificação e como ela participa das suas análises." : "Crie uma identificação clara e defina como ela participa das suas finanças."}</p>
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

          <fieldset className="category-behavior-field">
            <legend>{tt("settings.categoryBehaviorTitle", "Como esta categoria deve funcionar?")}</legend>
            <p>{tt("settings.categoryBehaviorDescription", "Estas opções só mudam como a categoria participa das análises e do planejamento. Elas não alteram o tipo nem o valor dos lançamentos.")}</p>
            <div className="category-behavior-options">
              <label className={`category-behavior-option ${ignoreInCategoryAnalysis ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={ignoreInCategoryAnalysis}
                  disabled={saving}
                  onChange={(event) => setIgnoreInCategoryAnalysis(event.target.checked)}
                />
                <i><EyeOff size={18} /></i>
                <span>
                  <strong>{t("settings.ignoreInCategoryAnalysis")}</strong>
                  <small>{tt("settings.ignoreInCategoryAnalysisDetailedHint", "Ative para transferências, ajustes ou itens que você não quer analisar como gasto. Os lançamentos continuam no histórico e alteram o saldo da carteira, mas ficam fora dos totais, limites, gráficos e alertas de Orçamento e gastos.")}</small>
                </span>
              </label>

              <label className={`category-behavior-option income ${includeInIncomePlanning ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={includeInIncomePlanning}
                  disabled={saving}
                  onChange={(event) => setIncludeInIncomePlanning(event.target.checked)}
                />
                <i><CircleDollarSign size={18} /></i>
                <span>
                  <strong>{t("settings.includeInIncomePlanning")}</strong>
                  <small>{tt("settings.includeInIncomePlanningDetailedHint", "Ative para categorias como Salário ou Freelance. Ganhos com esta categoria poderão ser escolhidos como renda no planejamento mensal; nada será incluído automaticamente e gastos continuarão sendo gastos.")}</small>
                </span>
              </label>
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
