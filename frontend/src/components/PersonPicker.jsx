import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, UserRound, X } from "lucide-react";
import { useI18n } from "../i18n/index.ts";
import { CREATE_RECEIVABLE_PERSON_VALUE } from "../app/constants.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function initialsFor(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "";
  if (parts.length === 1) return first.toLocaleUpperCase("pt-BR");
  const last = Array.from(parts[parts.length - 1])[0] || "";
  return `${first}${last}`.toLocaleUpperCase("pt-BR");
}

export default function PersonPicker({
  people = [],
  value = "",
  personName = "",
  onChange,
  required = false
}) {
  const { language } = useI18n();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const creating = value === CREATE_RECEIVABLE_PERSON_VALUE;
  const selected = creating ? null : people.find((person) => String(person.id) === String(value));

  const filtered = useMemo(() => {
    const query = normalizeText(search.trim());
    const sorted = [...people].sort((left, right) => left.name.localeCompare(right.name, language === "en-US" ? "en" : "pt"));
    if (!query) return sorted;
    return sorted.filter((person) => normalizeText(person.name).includes(query));
  }, [people, search, language]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const choose = (personId, nextName = "") => {
    onChange?.({ person_id: String(personId), person_name: nextName });
    setOpen(false);
    setSearch("");
  };

  const startCreate = () => {
    const suggestion = search.trim();
    onChange?.({ person_id: CREATE_RECEIVABLE_PERSON_VALUE, person_name: suggestion });
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={`person-picker ${open ? "open" : ""} ${creating ? "creating" : ""}`} ref={rootRef}>
      <button
        className={`person-picker-trigger ${selected || creating ? "selected" : ""}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-required={required}
      >
        <span className="person-picker-avatar">
          {selected || creating
            ? initialsFor(creating ? personName || (language === "en-US" ? "New" : "Nova") : selected.name)
            : <UserRound size={16} />}
        </span>
        <span className="person-picker-copy">
          <strong>
            {creating
              ? (language === "en-US" ? "New person" : "Nova pessoa")
              : selected?.name || (language === "en-US" ? "Select a person" : "Selecione uma pessoa")}
          </strong>
          <small>
            {creating
              ? (language === "en-US" ? "Will be created on save" : "Será cadastrada ao salvar")
              : selected
                ? (language === "en-US" ? "Receivable person" : "Pessoa do recebível")
                : (language === "en-US" ? "Search or create" : "Busque ou cadastre")}
          </small>
        </span>
        <ChevronDown size={17} />
      </button>

      {open && (
        <div className="person-picker-panel">
          <label className="person-picker-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={language === "en-US" ? "Search person..." : "Buscar pessoa..."}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label={language === "en-US" ? "Clear search" : "Limpar busca"}>
                <X size={14} />
              </button>
            )}
          </label>

          <div className="person-picker-results">
            {filtered.length ? filtered.map((person) => {
              const active = String(person.id) === String(value);
              return (
                <button
                  key={person.id}
                  className={`person-picker-option ${active ? "active" : ""}`}
                  type="button"
                  onClick={() => choose(person.id)}
                >
                  <span className="person-picker-avatar">{initialsFor(person.name)}</span>
                  <strong>{person.name}</strong>
                  {active && <Check size={15} />}
                </button>
              );
            }) : (
              <p className="person-picker-empty">
                {language === "en-US" ? "No person found." : "Nenhuma pessoa encontrada."}
              </p>
            )}
          </div>

          <button className="person-picker-create" type="button" onClick={startCreate}>
            <Plus size={15} />
            {search.trim()
              ? (language === "en-US" ? `Create "${search.trim()}"` : `Cadastrar "${search.trim()}"`)
              : (language === "en-US" ? "Create new person" : "Cadastrar nova pessoa")}
          </button>
        </div>
      )}

      {creating && (
        <label className="field-label person-picker-name">
          <span>{language === "en-US" ? "Person name" : "Nome da pessoa"}</span>
          <input
            value={personName}
            onChange={(event) => onChange?.({ person_id: CREATE_RECEIVABLE_PERSON_VALUE, person_name: event.target.value })}
            placeholder={language === "en-US" ? "Full name" : "Nome completo"}
            required
            autoFocus
          />
        </label>
      )}
    </div>
  );
}
