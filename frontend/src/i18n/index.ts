import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { enUS } from "./locales/en-US";
import { ptBR } from "./locales/pt-BR";
import { setFormatLocale } from "../utils/format";

export const LANGUAGE_STORAGE_KEY = "kashy365-language";
export const DEFAULT_LANGUAGE = "pt-BR";
export const SUPPORTED_LANGUAGES = ["pt-BR", "en-US"];

const dictionaries = {
  "pt-BR": ptBR,
  "en-US": enUS
};

const I18nContext = createContext(null);

function normalizeLanguage(language) {
  if (!language) return DEFAULT_LANGUAGE;
  const exact = SUPPORTED_LANGUAGES.find((item) => item === language);
  if (exact) return exact;
  const base = String(language).toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.find((item) => item.toLowerCase().startsWith(base)) || DEFAULT_LANGUAGE;
}

function detectInitialLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  return normalizeLanguage(window.navigator.language);
}

function readPath(source, path) {
  return String(path)
    .split(".")
    .reduce((current, part) => (current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined), source);
}

function interpolate(message, values) {
  if (!values) return message;
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    message
  );
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const initialLanguage = detectInitialLanguage();
    setFormatLocale(initialLanguage);
    return initialLanguage;
  });

  const setLanguage = useCallback((nextLanguage) => {
    const normalizedLanguage = normalizeLanguage(nextLanguage);
    setFormatLocale(normalizedLanguage);
    setLanguageState(normalizedLanguage);
  }, []);

  useEffect(() => {
    setFormatLocale(language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key, values) => {
    const dictionary = dictionaries[language] || dictionaries[DEFAULT_LANGUAGE];
    const fallback = dictionaries[DEFAULT_LANGUAGE];
    const message = readPath(dictionary, key) ?? readPath(fallback, key) ?? key;
    return interpolate(String(message), values);
  }, [language]);

  const value = useMemo(() => ({ t, language, setLanguage, supportedLanguages: SUPPORTED_LANGUAGES }), [t, language, setLanguage]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
