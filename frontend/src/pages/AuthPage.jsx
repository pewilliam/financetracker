import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import { useAuth } from "../hooks/useAuth.jsx";
import { BRAND_MARK_SRC } from "../app/constants.js";

export default function AuthPage({ mode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const isRegister = mode === "register";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  if (auth.authenticated) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (isRegister) await auth.signUp(form);
      else await auth.signIn({ email: form.email, password: form.password });
      toast.success(isRegister ? "Conta criada com sucesso" : "Login realizado");
      navigate("/");
    } catch {
      toast.error(isRegister ? "Erro ao criar conta" : "E-mail ou senha inválidos");
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
            <label><span>Nome</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          )}
          <label><span>E-mail</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label><span>Senha</span><input type="password" minLength="6" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
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

