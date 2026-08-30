import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { CreditCard, Download, Edit3, Languages, LockKeyhole, Plus, Settings2, ShieldCheck, Tags, Trash2, UserRound, WalletCards } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { setOpeningBalance, updatePassword } from "../api/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { useI18n } from "../i18n/index.ts";
import CategoryModal, { CATEGORY_COLORS } from "../modals/CategoryModal.jsx";
import DeleteCategoryModal from "../modals/DeleteCategoryModal.jsx";
import InvoiceTemplatesPage from "./InvoiceTemplatesPage.jsx";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function SettingsPage({
  summary,
  monthLabel,
  monthData,
  year,
  month,
  categories = [],
  invoiceTemplates = [],
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSaveInvoiceTemplate,
  onToggleInvoiceTemplate,
  onDeleteInvoiceTemplate,
  refresh
}) {
  const { user, updateProfile } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const tt = (key, pt) => language === "en-US" ? t(key) : pt;
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [allowOverdueInvoiceEdits, setAllowOverdueInvoiceEdits] = useState(Boolean(user?.allow_overdue_invoice_edits));
  const [password, setPassword] = useState({ current_password: "", new_password: "" });
  const [openingBalance, setOpeningBalanceInput] = useState("");
  const [categoryEditor, setCategoryEditor] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const validSections = new Set(["conta", "preferencias", "financeiro", "modelos", "dados"]);
  const requestedSection = searchParams.get("secao") || "conta";
  const activeSection = validSections.has(requestedSection) ? requestedSection : "conta";
  const sections = [
    { id: "conta", label: tt("settings.accountTab", "Conta"), icon: UserRound },
    { id: "preferencias", label: tt("settings.preferencesTab", "Preferências"), icon: Languages },
    { id: "financeiro", label: tt("settings.financeTab", "Financeiro"), icon: WalletCards },
    { id: "modelos", label: tt("settings.invoiceModelsTab", "Modelos de fatura"), icon: CreditCard },
    { id: "dados", label: tt("settings.dataTab", "Dados"), icon: Download }
  ];

  useEffect(() => {
    setProfile({ name: user?.name || "", email: user?.email || "" });
    setAllowOverdueInvoiceEdits(Boolean(user?.allow_overdue_invoice_edits));
  }, [user]);

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      await updateProfile({ ...profile, allow_overdue_invoice_edits: allowOverdueInvoiceEdits });
      toast.success(t("toasts.profileUpdated"));
    } catch {
      toast.error(t("toasts.profileUpdateError"));
    }
  };

  const saveInvoiceProtection = async (event) => {
    event.preventDefault();
    try {
      await updateProfile({ ...profile, allow_overdue_invoice_edits: allowOverdueInvoiceEdits });
      toast.success(allowOverdueInvoiceEdits ? "Ajustes em faturas vencidas liberados" : "Proteção de faturas vencidas restaurada");
    } catch {
      toast.error("Erro ao atualizar proteção de faturas");
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    try {
      await updatePassword(password);
      setPassword({ current_password: "", new_password: "" });
      toast.success(t("toasts.passwordUpdated"));
    } catch {
      toast.error(t("toasts.passwordUpdateError"));
    }
  };

  const saveOpeningBalance = async (event) => {
    event.preventDefault();
    try {
      await setOpeningBalance(year, month, parseTypedMoneyInput(openingBalance, language));
      toast.success(t("toasts.openingBalanceUpdated"));
      await refresh();
    } catch {
      toast.error(t("toasts.openingBalanceError"));
    }
  };

  const exportCsv = () => {
    const rows = [["data", "tipo", "valor", "descricao"], ...monthData.days.flatMap((day) => day.transactions.map((tx) => [tx.date, tx.type, tx.amount, tx.description || ""]))];
    const csv = rows.map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-${monthLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveManagedCategory = async (payload) => {
    if (categoryEditor?.id) await onUpdateCategory(categoryEditor.id, payload);
    else await onCreateCategory(payload);
    setCategoryEditor(null);
  };

  const removeManagedCategory = async () => {
    await onDeleteCategory(categoryToDelete.id);
    setCategoryToDelete(null);
  };

  return (
    <section className="settings-page">
      <header className="card settings-hero">
        <div className="settings-hero-icon"><Settings2 size={25} /></div>
        <div>
          <p className="eyebrow">{tt("settings.controlCenter", "Central de controle")}</p>
          <h1>{t("settings.title")}</h1>
          <p>{tt("settings.pageDescription", "Organize sua conta, preferências e dados financeiros em um só lugar.")}</p>
        </div>
        <div className="settings-hero-balance">
          <span>{monthLabel}</span>
          <strong>{formatMoney(summary.current_balance, language)}</strong>
          <small>{tt("settings.currentBalanceLabel", "Saldo atual")}</small>
        </div>
      </header>

      <nav className="settings-section-nav" aria-label={tt("settings.sections", "Seções das configurações")} role="tablist">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              className={active ? "active" : ""}
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSearchParams({ secao: section.id }, { replace: true })}
            >
              <Icon size={16} />
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>

      {activeSection === "conta" && <section className="settings-section" role="tabpanel">
        <div className="settings-section-heading">
          <span>{tt("settings.accountEyebrow", "MINHA CONTA")}</span>
          <h2>{tt("settings.accountHeading", "Perfil e segurança")}</h2>
          <p>{tt("settings.accountDescription", "Atualize seus dados de acesso e mantenha a conta protegida.")}</p>
        </div>
        <div className="settings-panel-grid">
          <form className="card settings-panel" onSubmit={saveProfile}>
            <div className="settings-panel-title"><i><UserRound size={18} /></i><div><h3>{t("settings.profile")}</h3><p>{tt("settings.profileDescription", "Informações usadas para identificar sua conta.")}</p></div></div>
            <div className="form-stack">
              <label><span>{t("settings.name")}</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
              <label><span>{t("settings.email")}</span><input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
              <button className="btn btn-primary" type="submit">{t("settings.saveProfile")}</button>
            </div>
          </form>

          <form className="card settings-panel" onSubmit={savePassword}>
            <div className="settings-panel-title"><i><LockKeyhole size={18} /></i><div><h3>{t("settings.password")}</h3><p>{tt("settings.passwordDescription", "Escolha uma senha forte e diferente das anteriores.")}</p></div></div>
            <div className="form-stack">
              <label><span>{t("settings.currentPassword")}</span><input type="password" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} /></label>
              <label><span>{t("settings.newPassword")}</span><input type="password" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} /></label>
              <button className="btn" type="submit">{t("settings.changePassword")}</button>
            </div>
          </form>
        </div>
      </section>}

      {activeSection === "preferencias" && <section className="settings-section" role="tabpanel">
        <div className="settings-section-heading">
          <span>{tt("settings.preferencesEyebrow", "PREFERÊNCIAS")}</span>
          <h2>{tt("settings.preferencesHeading", "Comportamento do aplicativo")}</h2>
          <p>{tt("settings.preferencesDescription", "Defina o idioma e as proteções aplicadas aos seus dados.")}</p>
        </div>
        <div className="settings-panel-grid">
          <div className="card settings-panel">
            <div className="settings-panel-title"><i><Languages size={18} /></i><div><h3>{t("settings.language")}</h3><p>{t("settings.languageDescription")}</p></div></div>
            <div className="language-options settings-language-options" role="group" aria-label={t("settings.language")}>
              <button className={`btn ${language === "pt-BR" ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => setLanguage("pt-BR")}>{t("settings.portuguese")}</button>
              <button className={`btn ${language === "en-US" ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => setLanguage("en-US")}>{t("settings.english")}</button>
            </div>
          </div>

          <form className="card settings-panel" onSubmit={saveInvoiceProtection}>
            <div className="settings-panel-title"><i><ShieldCheck size={18} /></i><div><h3>{tt("settings.invoiceProtection", "Proteção de faturas")}</h3><p>{tt("settings.invoiceProtectionDescription", "Evite alterações acidentais em faturas vencidas.")}</p></div></div>
            <div className="form-stack">
              <label className={`toggle-row ${allowOverdueInvoiceEdits ? "active" : ""}`}>
                <input type="checkbox" checked={allowOverdueInvoiceEdits} onChange={(event) => setAllowOverdueInvoiceEdits(event.target.checked)} />
                <span>{tt("settings.allowOverdueEdits", "Permitir ajustes em faturas vencidas não pagas")}</span>
              </label>
              <p className="settings-field-note">{tt("settings.paidInvoicesProtected", "Faturas pagas continuam protegidas e precisam voltar para pendente antes de qualquer alteração.")}</p>
              <button className="btn" type="submit">{tt("settings.saveProtection", "Salvar proteção")}</button>
            </div>
          </form>
        </div>
      </section>}

      {activeSection === "financeiro" && <section className="settings-section" role="tabpanel">
        <div className="settings-section-heading">
          <span>{tt("settings.financialOrganizationEyebrow", "ORGANIZAÇÃO FINANCEIRA")}</span>
          <h2>{tt("settings.financialOrganizationHeading", "Saldo e categorias")}</h2>
          <p>{tt("settings.financialOrganizationDescription", "Ajuste a base do mês e mantenha suas classificações organizadas.")}</p>
        </div>

        <form className="card settings-panel settings-balance-panel" onSubmit={saveOpeningBalance}>
          <div className="settings-panel-title"><i><WalletCards size={18} /></i><div><h3>{t("settings.openingBalance")}</h3><p>{t("settings.currentBalance", { value: formatMoney(summary.current_balance, language) })}</p></div></div>
          <div className="settings-inline-form">
            <label><span>{t("settings.monthBalance")}</span><input inputMode="decimal" placeholder={formatMoney(0, language)} value={openingBalance} onChange={(event) => setOpeningBalanceInput(formatTypedMoneyForEditing(event.target.value, language))} onBlur={() => setOpeningBalanceInput(formatTypedMoneyAsCurrency(openingBalance, language))} /></label>
            <button className="btn" type="submit">{t("settings.saveBalance")}</button>
          </div>
        </form>

        <div className="card settings-category-card">
        <div className="settings-category-head">
          <div>
            <span className="settings-section-icon"><Tags size={18} /></span>
            <div>
              <h3>{tt("settings.categories", "Categorias")}</h3>
              <p>{tt("settings.categoriesDescription", "Edite nomes e cores ou remova categorias que não utiliza mais.")}</p>
            </div>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setCategoryEditor({})}><Plus size={16} /> {tt("settings.newCategory", "Nova categoria")}</button>
        </div>

        {categories.length ? (
          <div className="settings-category-list">
            {categories.map((category) => (
              <div className="settings-category-row" key={category.id}>
                <span className="category-badge" style={{ "--category-color": category.color }}>{category.name}</span>
                <div className="settings-category-actions">
                  <button className="icon-btn small" type="button" onClick={() => setCategoryEditor(category)} aria-label={`Editar ${category.name}`}><Edit3 size={15} /></button>
                  <button className="icon-btn small danger" type="button" onClick={() => setCategoryToDelete(category)} aria-label={`Excluir ${category.name}`}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="settings-category-empty">{tt("settings.noCategories", "Nenhuma categoria cadastrada.")}</p>}
        </div>
      </section>}

      {activeSection === "modelos" && <section className="settings-section" role="tabpanel">
        <div className="settings-section-heading">
          <span>{tt("settings.invoiceModelsEyebrow", "FATURAS")}</span>
          <h2>{tt("settings.invoiceModelsHeading", "Modelos de fatura")}</h2>
          <p>{tt("settings.invoiceModelsDescription", "Gerencie os cartões e contas usados para organizar suas faturas mensais.")}</p>
        </div>
        <InvoiceTemplatesPage
          embedded
          templates={invoiceTemplates}
          onSave={onSaveInvoiceTemplate}
          onToggle={onToggleInvoiceTemplate}
          onDelete={onDeleteInvoiceTemplate}
        />
      </section>}

      {activeSection === "dados" && <section className="settings-section" role="tabpanel">
        <div className="settings-section-heading">
          <span>{tt("settings.dataEyebrow", "SEUS DADOS")}</span>
          <h2>{tt("settings.dataHeading", "Exportação")}</h2>
          <p>{tt("settings.dataDescription", "Baixe uma cópia dos lançamentos do mês selecionado.")}</p>
        </div>
        <div className="card settings-export-panel">
          <div className="settings-panel-title"><i><Download size={18} /></i><div><h3>{t("settings.export")}</h3><p>{t("settings.exportDescription")}</p></div></div>
          <button className="btn btn-primary" type="button" onClick={exportCsv}><Download size={16} /> {t("settings.exportCsv")}</button>
        </div>
      </section>}

      {categoryEditor && (
        <CategoryModal
          category={categoryEditor.id ? categoryEditor : null}
          suggestedColor={CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]}
          onSave={saveManagedCategory}
          onClose={() => setCategoryEditor(null)}
        />
      )}
      {categoryToDelete && <DeleteCategoryModal category={categoryToDelete} onClose={() => setCategoryToDelete(null)} onConfirm={removeManagedCategory} />}
    </section>
  );
}


