import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, Sparkles } from "lucide-react";
import { askFinancialAssistant } from "../api/api.js";
import { useI18n } from "../i18n/index.ts";
import "./assistant.css";

export default function AssistantPage() {
  const { t, language } = useI18n();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asOf, setAsOf] = useState(null);
  const controller = useRef(null);
  const conversationEnd = useRef(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => conversationEnd.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }), [messages, busy]);

  async function send(value = question) {
    const text = value.trim();
    if (busy || text.length < 3) return;
    setError("");
    setBusy(true);
    setQuestion("");
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 1000) }));
    setMessages((current) => [...current, { role: "user", content: text }]);
    controller.current = new AbortController();
    try {
      const result = await askFinancialAssistant(text, history, { signal: controller.current.signal });
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
      setAsOf(result.as_of);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setMessages((current) => current.slice(0, -1));
        setQuestion(text);
        setError(requestError.status === 429 ? t("assistant.rateLimited") : requestError.message || t("assistant.failed"));
      }
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  const suggestions = [t("assistant.suggestion1"), t("assistant.suggestion2"), t("assistant.suggestion3")];

  return (
    <section className="assistant-page" aria-labelledby="assistant-title">
      <header className="assistant-intro">
        <span className="assistant-symbol" aria-hidden="true"><Sparkles size={25} /></span>
        <p className="eyebrow">{t("assistant.eyebrow")}</p>
        <h1 id="assistant-title">{t("assistant.title")}</h1>
        <p>{t("assistant.description")}</p>
      </header>

      <div className="assistant-panel">
        <div className="assistant-conversation" role="log" aria-live="polite" aria-label={t("assistant.conversation")}>
          {messages.length === 0 && (
            <div className="assistant-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <p>{t("assistant.welcome")}</p>
              <div className="assistant-suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => send(suggestion)} disabled={busy}>{suggestion}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`assistant-message ${message.role}`} key={`${index}-${message.role}`}>
              <span>{message.role === "user" ? t("assistant.you") : "Kashy365"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {busy && <p className="assistant-thinking" role="status">{t("assistant.thinking")}</p>}
          <div ref={conversationEnd} />
        </div>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <label htmlFor="assistant-question" className="sr-only">{t("assistant.questionLabel")}</label>
          <textarea
            id="assistant-question"
            rows={2}
            maxLength={600}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={t("assistant.placeholder")}
            disabled={busy}
          />
          <button type="submit" aria-label={t("assistant.send")} disabled={busy || question.trim().length < 3}><ArrowUp size={18} /></button>
        </form>
        {error && <p className="assistant-error" role="alert">{error}</p>}
      </div>

      <p className="assistant-disclosure">
        {t("assistant.disclosure")}
        {asOf && ` ${t("assistant.updated", { date: new Intl.DateTimeFormat(language).format(new Date(`${asOf}T12:00:00`)) })}`}
      </p>
    </section>
  );
}
