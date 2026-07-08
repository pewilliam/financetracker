import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { setOpeningBalance, updatePassword } from "../api/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney, formatTypedMoneyAsCurrency, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";

export default function SettingsPage({ summary, monthLabel, monthData, year, month, refresh }) {
  const { user, updateProfile } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [allowOverdueInvoiceEdits, setAllowOverdueInvoiceEdits] = useState(Boolean(user?.allow_overdue_invoice_edits));
  const [password, setPassword] = useState({ current_password: "", new_password: "" });
  const [openingBalance, setOpeningBalanceInput] = useState("");

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
  return (
    <section className="settings-grid">
      <div className="card settings-language-card">
        <h2>{t("settings.language")}</h2>
        <p className="muted">{t("settings.languageDescription")}</p>
        <div className="language-options" role="group" aria-label={t("settings.language")}>
          <button className={`btn ${language === "pt-BR" ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => setLanguage("pt-BR")}>{t("settings.portuguese")}</button>
          <button className={`btn ${language === "en-US" ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => setLanguage("en-US")}>{t("settings.english")}</button>
        </div>
      </div>
      <form className="card" onSubmit={saveProfile}><h2>{t("settings.profile")}</h2><div className="form-stack"><label><span>{t("settings.name")}</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label><span>{t("settings.email")}</span><input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label><button className="btn btn-primary">{t("settings.saveProfile")}</button></div></form>
      <form className="card" onSubmit={saveInvoiceProtection}>
        <h2>Proteção de faturas</h2>
        <p className="muted">Mantenha a trava padrão ligada. Ative apenas para corrigir histórico restaurado ou lançar compras antigas.</p>
        <div className="form-stack">
          <label className={`toggle-row ${allowOverdueInvoiceEdits ? "active" : ""}`}>
            <input type="checkbox" checked={allowOverdueInvoiceEdits} onChange={(event) => setAllowOverdueInvoiceEdits(event.target.checked)} />
            <span>Permitir ajustes em faturas vencidas não pagas</span>
          </label>
          <p className="muted">Faturas pagas continuam protegidas. Para alterar uma fatura paga, marque-a como pendente antes.</p>
          <button className="btn">Salvar proteção</button>
        </div>
      </form>
      <form className="card" onSubmit={savePassword}><h2>{t("settings.password")}</h2><div className="form-stack"><label><span>{t("settings.currentPassword")}</span><input type="password" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} /></label><label><span>{t("settings.newPassword")}</span><input type="password" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} /></label><button className="btn">{t("settings.changePassword")}</button></div></form>
      <form className="card" onSubmit={saveOpeningBalance}><h2>{t("settings.openingBalance")}</h2><p className="muted">{t("settings.currentBalance", { value: formatMoney(summary.current_balance, language) })}</p><div className="form-stack"><label><span>{t("settings.monthBalance")}</span><input inputMode="decimal" placeholder={formatMoney(0, language)} value={openingBalance} onChange={(event) => setOpeningBalanceInput(formatTypedMoneyForEditing(event.target.value, language))} onBlur={() => setOpeningBalanceInput(formatTypedMoneyAsCurrency(openingBalance, language))} /></label><button className="btn">{t("settings.saveBalance")}</button></div></form>
      <div className="card"><h2>{t("settings.export")}</h2><p className="muted">{t("settings.exportDescription")}</p><button className="btn btn-primary" onClick={exportCsv}>{t("settings.exportCsv")}</button></div>
    </section>
  );
}


