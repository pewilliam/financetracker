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
}) {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const selected = options.find((option) => optionKey(option) === value);

  useEffect(() => {
    if (autoOpen && !value) setOpen(true);
  }, [autoOpen, value]);

  const visibleOptions = useMemo(() => {
    const query = normalizeText(search);
    return options
      .filter((option) => {
        if (mode === "transaction" && option.source_type === "installment_purchase") return false;
        if (mode === "receivable" && option.source_type === "installment_item" && optionKey(option) !== value) return false;
        const isSelected = optionKey(option) === value;
        const ownLink = (currentTransactionId && option.transaction_ids?.includes(currentTransactionId))
          || (currentReceivableId && option.receivable_ids?.includes(currentReceivableId));
        if (!isSelected && !ownLink && Number(option.available_amount || 0) <= 0) return false;
        if (kind !== "all" && optionKind(option) !== kind) return false;
        if (!query) return true;
        const haystack = normalizeText([
          option.description,
          option.invoice_name,
          option.date,
          option.amount,
          formatMoney(option.amount, language),
          option.installment_number ? `${option.installment_number}/${option.installment_count}` : "",
        ].join(" "));
        return haystack.includes(query);
      })
      .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || right.source_id - left.source_id);
  }, [options, value, mode, search, kind, language, currentTransactionId, currentReceivableId]);

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

  const availableForSelected = selected
    ? Number(selected.available_amount || 0) + (
        selected.transaction_ids?.includes(currentTransactionId) || selected.receivable_ids?.includes(currentReceivableId)
          ? Number(currentAmount || 0)
          : 0
      )
    : 0;

  return (
    <div className={`expense-picker ${open ? "open" : ""}`}>
      <button className={`expense-picker-trigger ${selected ? "selected" : ""}`} type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {selected ? (
          <>
            <span className="expense-picker-trigger-icon">{optionKind(selected) === "months" ? <CalendarDays size={17} /> : <CreditCard size={17} />}</span>
            <span className="expense-picker-trigger-copy">
              <strong>{selected.description}</strong>
              <small>{selected.invoice_name || (selected.origin === "months" ? "Meses" : "Fatura")} · {formatDateShort(selected.date, language)} · {formatMoney(selected.amount, language)}</small>
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

      {selected && !open && (
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
              ["months", language === "en-US" ? "Months" : "Meses"],
              ["invoice", language === "en-US" ? "Invoices" : "Faturas"],
              ["installment", language === "en-US" ? "Installments" : "Parcelados"],
            ].map(([filter, label]) => <button className={kind === filter ? "active" : ""} key={filter} type="button" onClick={() => setKind(filter)}>{label}</button>)}
          </div>
          <div className="expense-picker-results">
            {groups.length ? groups.map((group) => (
              <section className="expense-picker-group" key={group.key}>
                <header><span>{monthLabel(group.key, language)}</span><small>{group.items.length}</small></header>
                {group.items.map((option) => {
                  const key = optionKey(option);
                  const active = key === value;
                  return (
                    <button className={`expense-picker-option ${active ? "active" : ""}`} type="button" key={key} onClick={() => choose(option)}>
                      <span className="expense-picker-option-icon">{optionKind(option) === "months" ? <ReceiptText size={16} /> : <CreditCard size={16} />}</span>
                      <span className="expense-picker-option-copy">
                        <strong>{option.description}</strong>
                        <small>
                          {option.invoice_name || (option.origin === "months" ? "Meses" : "Fatura")}
                          {option.installment_number ? ` · ${option.installment_number}/${option.installment_count}` : ""}
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
            <span>{visibleOptions.length} {language === "en-US" ? "expenses found" : "gastos encontrados"}</span>
            {visibleOptions.length > 80 && <small>{language === "en-US" ? "Refine the search to see more." : "Refine a busca para ver mais resultados."}</small>}
          </footer>
        </div>
      )}
    </div>
  );
}
