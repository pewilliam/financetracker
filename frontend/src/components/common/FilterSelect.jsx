import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export default function FilterSelect({
  value,
  options = [],
  onChange,
  ariaLabel,
  searchable = false,
  searchPlaceholder = "Buscar opção...",
  disabled = false,
  emptyLabel = "Nenhuma opção encontrada.",
}) {
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({});
  const selected = options.find((option) => String(option.value) === String(value)) || null;
  const visibleOptions = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return options;
    return options.filter((option) => (
      normalize(option.label).includes(term)
      || normalize(option.description).includes(term)
      || normalize(option.searchText).includes(term)
    ));
  }, [options, search]);

  useEffect(() => {
    if (!open || disabled) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = Math.min(310, 56 + options.length * 44);
      const openUp = window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight;
      setPosition({
        left: Math.max(8, rect.left),
        width: Math.max(220, rect.width),
        top: openUp ? undefined : rect.bottom + 6,
        bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      });
    };
    positionMenu();
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [disabled, open, options.length]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setSearch("");
    }
  }, [disabled]);

  const choose = (nextValue) => {
    onChange?.(String(nextValue));
    setOpen(false);
    setSearch("");
  };

  const focusOption = (index) => {
    const buttons = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
    if (buttons.length) buttons[(index + buttons.length) % buttons.length].focus();
  };

  const optionKeyDown = (event, index) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      rootRef.current?.querySelector("button")?.focus();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(event.key === "Home" ? 0 : visibleOptions.length - 1);
    }
  };

  const renderOptionContent = (option, compact = false) => (
    <span className={`filter-select-option-text ${option.description ? "has-description" : ""} ${compact ? "compact" : ""}`}>
      <strong className="filter-select-value">{option?.label || "—"}</strong>
      {option?.description ? <small>{option.description}</small> : null}
    </span>
  );

  return (
    <div className={`filter-select category-select category-multi-select ${open ? "open" : ""} ${disabled ? "is-disabled" : ""}`} ref={rootRef}>
      <div className="category-multi-desktop-control">
        <button
          className="category-multi-trigger"
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setSearch("");
            setOpen((current) => !current);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="category-multi-values">{renderOptionContent(selected, true)}</span>
          <ChevronDown className="category-multi-chevron" size={15} />
        </button>
      </div>
      <div className="category-multi-native-control">
        <div className="category-multi-native-picker">
          <div className="category-multi-trigger" aria-hidden="true">
            <span className="category-multi-values">{renderOptionContent(selected, true)}</span>
            <ChevronDown className="category-multi-chevron" size={15} />
          </div>
          <select value={value} disabled={disabled} onChange={(event) => choose(event.target.value)} aria-label={ariaLabel}>
            {options.map((option) => (
              <option value={option.value} key={option.value}>
                {option.description ? `${option.label} · ${option.description}` : option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {open && createPortal(
        <div className="category-multi-menu filter-select-menu" style={position} ref={menuRef}>
          {searchable && (
            <div className="category-multi-search">
              <Search size={15} />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusOption(0);
                  }
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setOpen(false);
                    rootRef.current?.querySelector("button")?.focus();
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder.replace(/\.\.\.$/, "")}
              />
            </div>
          )}
          <div className="category-multi-options" role="listbox" aria-label={ariaLabel}>
            {visibleOptions.map((option, index) => {
              const checked = String(option.value) === String(value);
              return (
                <button
                  className={`${checked ? "selected" : ""} ${option.description ? "has-description" : ""}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={checked}
                  onClick={() => choose(option.value)}
                  onKeyDown={(event) => optionKeyDown(event, index)}
                  key={option.value}
                >
                  <i style={{ "--category-color": option.color || "var(--primary)" }} />
                  {renderOptionContent(option)}
                  <b>{checked && <Check size={14} />}</b>
                </button>
              );
            })}
            {!visibleOptions.length && <p>{emptyLabel}</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
