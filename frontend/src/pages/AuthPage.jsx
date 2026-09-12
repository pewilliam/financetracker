import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { BRAND_MARK_SRC } from "../app/constants.js";

function PasswordField({ label, visible, onToggleVisible, ...inputProps }) {
  return (
    <label>
      <span>{label}</span>
      <span className="password-input-wrap">
        <input {...inputProps} type={visible ? "text" : "password"} />
        <button
          type="button"
          className="password-visibility-toggle"
          onClick={onToggleVisible}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

export default function AuthPage({ mode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const isRegister = mode === "register";
  const [form, setForm] = useState({ name: "", email: "", password: "", passwordConfirmation: "" });
  const [visiblePasswords, setVisiblePasswords] = useState({ password: false, passwordConfirmation: false });
  const [busy, setBusy] = useState(false);

  const passwordIsLongEnough = form.password.length >= 12;
  const passwordFitsBcrypt = new TextEncoder().encode(form.password).length <= 72;
  const passwordsMatch = form.password === form.passwordConfirmation;

  if (auth.authenticated) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (isRegister && (!passwordIsLongEnough || !passwordFitsBcrypt || !passwordsMatch)) {
      toast.error(!passwordsMatch ? "As senhas não coincidem" : !passwordIsLongEnough ? "Use uma senha com pelo menos 12 caracteres" : "A senha é longa demais");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        const { passwordConfirmation: _, ...payload } = form;
        await auth.signUp(payload);
      }
      else await auth.signIn({ email: form.email, password: form.password });
      toast.success(isRegister ? "Conta criada com sucesso" : "Login realizado");
      navigate("/");
    } catch (error) {
      if (error.status === 429) {
        const wait = error.retryAfter ? ` Aguarde ${error.retryAfter}s.` : " Tente novamente mais tarde.";
        toast.error(`Muitas tentativas deste endereço IP.${wait}`);
      } else if (isRegister && error.status === 409) {
        toast.error("Já existe uma conta com este e-mail");
      } else if (isRegister && error.status === 422) {
        if (error.message?.includes("name or email")) toast.error("A senha não pode conter seu nome ou e-mail");
        else if (error.message?.includes("easy to guess")) toast.error("Esta senha é muito fácil de adivinhar");
        else toast.error(error.message || "Confira os dados informados");
      } else {
        toast.error(isRegister ? "Erro ao criar conta" : "E-mail ou senha inválidos");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <Toaster position="top-right" />
      <section className="auth-card">
        <div className="auth-logo"><img src={BRAND_MARK_SRC} alt="" aria-hidden="true" /></div>
        <h1>Kashy365</h1>
        <p>{isRegister ? "Crie sua conta para começar." : "Entre para ver seus dados financeiros."}</p>
        <form className="form-stack" onSubmit={submit}>
          {isRegister && (
            <label><span>Nome</span><input autoComplete="name" minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          )}
          <label><span>E-mail</span><input type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <PasswordField
            label="Senha"
            visible={visiblePasswords.password}
            onToggleVisible={() => setVisiblePasswords((current) => ({ ...current, password: !current.password }))}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 12 : 1}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
          {isRegister && <>
            <PasswordField
              label="Confirmar senha"
              visible={visiblePasswords.passwordConfirmation}
              onToggleVisible={() => setVisiblePasswords((current) => ({ ...current, passwordConfirmation: !current.passwordConfirmation }))}
              autoComplete="new-password"
              minLength="12"
              value={form.passwordConfirmation}
              onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })}
              required
            />
            <ul className="password-requirements" aria-live="polite">
              <li className={passwordIsLongEnough ? "valid" : ""}>Pelo menos 12 caracteres</li>
              <li className={form.passwordConfirmation && passwordsMatch ? "valid" : ""}>As duas senhas devem coincidir</li>
            </ul>
          </>}
          <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? "Aguarde..." : isRegister ? "Criar conta" : "Entrar"}</button>
        </form>
        <Link className="auth-link" to={isRegister ? "/login" : "/register"}>
          {isRegister ? "Já tenho conta" : "Criar cadastro"}
        </Link>
      </section>
    </main>
  );
}

// Conteúdo interno da sidebar — compartilhado entre desktop e mobile
