import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, CreditCard, ReceiptText, Search, X } from "lucide-react";

import { useI18n } from "../i18n/index.ts";
import { formatDateShort, formatMoney, getFormatLocale } from "../utils/format.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function optionKey(option) {
  return `${option.source_type}:${option.source_id}`;
}

function optionKind(option) {
  if (["installment_item", "installment_purchase"].includes(option.source_type)) return "installment";
  return option.origin === "months" ? "months" : "invoice";
}

function monthLabel(value, language) {
  if (!value) return language === "en-US" ? "No date" : "Sem data";
  const [year, month] = value.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString(getFormatLocale(language), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function ExpensePicker({
  options = [],
  value = "",
  onChange,
  mode = "receivable",
  autoOpen = false,
  currentAmount = 0,
  currentTransactionId = null,
  currentReceivableId = null,
  displayedAvailable = null,
}) {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const selected = options.find((option) => optionKey(option) === value);
  const displaySelected = (() => {
    if (!selected) return null;
    if (selected.source_type !== "installment_item" || !selected.purchase_id) return selected;
    const purchase = options.find((option) => option.source_type === "installment_purchase" && option.source_id === selected.purchase_id);
    return purchase || selected;
  })();

  useEffect(() => {
    if (autoOpen && !value) setOpen(true);
  }, [autoOpen, value]);

  const MIN_SEARCH_CHARS = 3;
  const searchReady = normalizeText(search).replace(/\s+/g, "").length >= MIN_SEARCH_CHARS;

  const visibleOptions = useMemo(() => {
    const query = normalizeText(search).trim();
    if (query.replace(/\s+/g, "").length < MIN_SEARCH_CHARS) return [];
    return options
      .filter((option) => {
        if (mode === "transaction" && option.source_type === "installment_purchase") return false;
        if (mode === "receivable" && option.source_type === "installment_item") return false;
        const isSelected = optionKey(option) === value || (displaySelected && optionKey(option) === optionKey(displaySelected));
        const ownLink = (currentTransactionId && option.transaction_ids?.includes(currentTransactionId))
          || (currentReceivableId && option.receivable_ids?.includes(currentReceivableId));
        if (!isSelected && !ownLink && Number(option.available_amount || 0) <= 0) return false;
        if (kind !== "all" && optionKind(option) !== kind) return false;
        const haystack = normalizeText([
          option.description,
          option.invoice_name,
          option.date,
          option.amount,
          formatMoney(option.amount, language),
          option.installment_number ? `${option.installment_number}/${option.installment_count}` : "",
          option.installment_count ? `${option.installment_count}x` : "",
        ].join(" "));
        return haystack.includes(query);
      })
      .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || right.source_id - left.source_id);
  }, [options, value, mode, search, kind, language, currentTransactionId, currentReceivableId, displaySelected]);

  const groups = useMemo(() => visibleOptions.slice(0, 80).reduce((result, option) => {
    const key = String(option.date || "").slice(0, 7) || "none";
    const existing = result.find((group) => group.key === key);
    if (existing) existing.items.push(option);
    else result.push({ key, items: [option] });
    return result;
  }, []), [visibleOptions]);

  const choose = (option) => {
    onChange?.(optionKey(option), option);
    setOpen(false);
    setSearch("");
  };

  const availableForSelected = displaySelected
    ? (displayedAvailable != null
      ? Number(displayedAvailable || 0)
      : Number(displaySelected.available_amount || 0) + (
          displaySelected.transaction_ids?.includes(currentTransactionId) || displaySelected.receivable_ids?.includes(currentReceivableId)
            ? Number(currentAmount || 0)
            : 0
        ))
    : 0;

  const selectedMeta = displaySelected
    ? [
        displaySelected.invoice_name || (displaySelected.origin === "months" ? (language === "en-US" ? "Monthly control" : "Controle mensal") : (language === "en-US" ? "Invoice" : "Fatura")),
        displaySelected.installment_count > 1 ? `${displaySelected.installment_count}x` : null,
        formatDateShort(displaySelected.date, language),
        formatMoney(displaySelected.amount, language),
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div className={`expense-picker ${open ? "open" : ""}`}>
      <button className={`expense-picker-trigger ${displaySelected ? "selected" : ""}`} type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {displaySelected ? (
          <>
            <span className="expense-picker-trigger-icon">{optionKind(displaySelected) === "months" ? <CalendarDays size={17} /> : <CreditCard size={17} />}</span>
            <span className="expense-picker-trigger-copy">
              <strong>{displaySelected.description}</strong>
              <small>{selectedMeta}</small>
            </span>
          </>
        ) : (
          <>
            <Search size={17} />
            <span className="expense-picker-trigger-copy">
              <strong>{language === "en-US" ? "Find an expense" : "Buscar um gasto"}</strong>
              <small>{language === "en-US" ? "Search by description, invoice, date or amount" : "Pesquise por descrição, fatura, data ou valor"}</small>
            </span>
          </>
        )}
        <ChevronDown size={17} />
      </button>

      {displaySelected && !open && (
        <div className="expense-picker-selected-meta">
          <span>{language === "en-US" ? "Available" : "Disponível"}: {formatMoney(availableForSelected, language)}</span>
          <button type="button" onClick={() => onChange?.("", null)}><X size={13} /> {language === "en-US" ? "Remove link" : "Remover vínculo"}</button>
        </div>
      )}

      {open && (
        <div className="expense-picker-panel">
          <div className="expense-picker-search">
            <Search size={16} />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "en-US" ? "Type to find an expense..." : "Digite para encontrar um gasto..."} />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca"><X size={15} /></button>}
          </div>
          <div className="expense-picker-filters">
            {[
              ["all", language === "en-US" ? "All" : "Todos"],
              ["months", language === "en-US" ? "Monthly control" : "Controle mensal"],
              ["invoice", language === "en-US" ? "Invoices" : "Faturas"],
              ["installment", language === "en-US" ? "Installments" : "Parcelados"],
            ].map(([filter, label]) => <button className={kind === filter ? "active" : ""} key={filter} type="button" onClick={() => setKind(filter)}>{label}</button>)}
          </div>
          <div className="expense-picker-results">
            {!searchReady ? (
              <div className="expense-picker-empty">
                <Search size={22} />
                <strong>{language === "en-US" ? "Keep typing to search" : "Continue digitando para buscar"}</strong>
                <small>{language === "en-US" ? "Enter at least 3 characters to see expenses." : "Digite pelo menos 3 caracteres para ver os gastos."}</small>
              </div>
            ) : groups.length ? groups.map((group) => (
              <section className="expense-picker-group" key={group.key}>
                <header><span>{monthLabel(group.key, language)}</span><small>{group.items.length}</small></header>
                {group.items.map((option) => {
                  const key = optionKey(option);
                  const active = key === value || (displaySelected && key === optionKey(displaySelected));
                  return (
                    <button className={`expense-picker-option ${active ? "active" : ""}`} type="button" key={key} onClick={() => choose(option)}>
                      <span className="expense-picker-option-icon">{optionKind(option) === "months" ? <ReceiptText size={16} /> : <CreditCard size={16} />}</span>
                      <span className="expense-picker-option-copy">
                        <strong>{option.description}</strong>
                        <small>
                          {option.invoice_name || (option.origin === "months" ? (language === "en-US" ? "Monthly control" : "Controle mensal") : (language === "en-US" ? "Invoice" : "Fatura"))}
                          {option.installment_count > 1 ? ` · ${option.installment_count}x` : ""}
                          {` · ${formatDateShort(option.date, language)}`}
                        </small>
                      </span>
                      <span className="expense-picker-option-money">
                        <strong>{formatMoney(option.amount, language)}</strong>
                        <small>{language === "en-US" ? "available" : "disponível"} {formatMoney(option.available_amount, language)}</small>
                      </span>
                      {active && <Check className="expense-picker-check" size={16} />}
                    </button>
                  );
                })}
              </section>
            )) : (
              <div className="expense-picker-empty">
                <Search size={22} />
                <strong>{language === "en-US" ? "No expense found" : "Nenhum gasto encontrado"}</strong>
                <small>{language === "en-US" ? "Try another description, date or amount." : "Tente outra descrição, data ou valor."}</small>
              </div>
            )}
          </div>
          <footer>
            {searchReady ? (
              <>
                <span>{visibleOptions.length} {language === "en-US" ? "expenses found" : "gastos encontrados"}</span>
                {visibleOptions.length > 80 && <small>{language === "en-US" ? "Refine the search to see more." : "Refine a busca para ver mais resultados."}</small>}
              </>
            ) : (
              <span>{language === "en-US" ? "Minimum 3 characters" : "Mínimo de 3 caracteres"}</span>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
