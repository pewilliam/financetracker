import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import CategoryModal from "../modals/CategoryModal.jsx";

function normalizeValues(value, values) {
  const source = values ?? value;
  if (Array.isArray(source)) return source.filter(Boolean).map(String);
  return source ? [String(source)] : [];
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export default function CategorySelect({
  categories = [],
  value = "",
  values,
  onChange,
  onCreate,
  className = "",
  multiple = true,
  clearable = true,
  showBulkActions = false,
  placeholder = "Sem categoria",
  searchPlaceholder = "Buscar categoria...",
  ariaLabel = "Categorias",
}) {
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPosition, setMenuPosition] = useState({});
  const [creating, setCreating] = useState(false);
  const selectedIds = useMemo(() => normalizeValues(value, values), [value, values]);
  const selected = categories.filter((category) => selectedIds.includes(String(category.id)));
  const filteredCategories = useMemo(() => {
    const normalizedSearch = normalizeSearch(search.trim());
    if (!normalizedSearch) return categories;
    return categories.filter((category) => normalizeSearch(category.name).includes(normalizedSearch));
  }, [categories, search]);
  const filteredIds = filteredCategories.map((category) => String(category.id));
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = 330;
      const openUp = window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight;
      setMenuPosition({
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  const toggle = (categoryId) => {
    const id = String(categoryId);
    if (!multiple) {
      onChange?.(id);
      setOpen(false);
      return;
    }
    onChange?.(selectedIds.includes(id)
      ? selectedIds.filter((current) => current !== id)
      : [...selectedIds, id]);
  };

  const selectAllVisible = () => {
    if (!filteredIds.length) return;
    if (search.trim()) {
      onChange?.([...new Set([...selectedIds, ...filteredIds])]);
      return;
    }
    onChange?.(filteredIds);
  };

  const create = async (payload) => {
    const category = await onCreate(payload);
    onChange?.([...selectedIds, String(category.id)]);
    setCreating(false);
    setOpen(false);
  };

  const clear = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    onChange?.([]);
    setOpen(false);
  };

  const handleFocusLeave = (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget && (rootRef.current?.contains(nextTarget) || menuRef.current?.contains(nextTarget))) return;
    setOpen(false);
  };

  const categoryOptionButtons = () => (
    Array.from(menuRef.current?.querySelectorAll(".category-multi-options > button") || [])
  );

  const focusCategoryOption = (index) => {
    const options = categoryOptionButtons();
    if (!options.length) return false;
    options[(index + options.length) % options.length].focus();
    return true;
  };

  const closeAndFocusSubmit = () => {
    const form = rootRef.current?.closest("form");
    const submitControl = form?.querySelector([
      'button[type="submit"]:not(:disabled)',
      'input[type="submit"]:not(:disabled)',
      'button:not([type]):not(:disabled)',
    ].join(", "));
    setOpen(false);
    requestAnimationFrame(() => {
      if (submitControl) submitControl.focus();
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusSubmit();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusCategoryOption(event.key === "ArrowDown" ? 0 : -1);
      return;
    }

    if (event.key === "Tab" && !event.shiftKey && focusCategoryOption(0)) {
      event.preventDefault();
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusSubmit();
      return;
    }

    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }

    const targetIndex = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: categoryOptionButtons().length - 1,
    }[event.key];

    if (targetIndex !== undefined) {
      event.preventDefault();
      focusCategoryOption(targetIndex);
    }
  };

  const handleNativeSelect = (event) => {
    const nextValue = event.target.value;
    if (!nextValue) return;
    if (nextValue === "__create__") {
      setCreating(true);
      return;
    }
    toggle(nextValue);
  };

  const removeSelected = (event, categoryId) => {
    event.preventDefault();
    event.stopPropagation();
    onChange?.(selectedIds.filter((current) => current !== String(categoryId)));
  };

  const allSelected = categories.length > 0 && selected.length === categories.length
    && categories.every((category) => selectedIds.includes(String(category.id)));
  const visibleSelected = allSelected || selected.length <= 2 ? selected : selected.slice(0, 1);
  const hiddenSelectedCount = allSelected ? 0 : Math.max(0, selected.length - visibleSelected.length);
  const canRemoveChips = multiple && clearable;

  const renderBulkActions = () => (multiple && showBulkActions ? (
    <div className="category-multi-bulk-actions">
      <button type="button" disabled={!filteredIds.length || allFilteredSelected} onClick={selectAllVisible}>Selecionar todas</button>
      <button className="subtle" type="button" disabled={!selectedIds.length} onClick={() => onChange?.([])}>Limpar seleção</button>
    </div>
  ) : null);

  const selectedValues = (() => {
    if (!selected.length) return <span className="category-multi-placeholder">{placeholder}</span>;
    if (allSelected) {
      return <span className="category-choice-chip is-summary"><span className="category-choice-label">Todas · {selected.length}</span></span>;
    }
    return (
      <>
        {visibleSelected.map((category) => (
          <span className={`category-choice-chip ${canRemoveChips ? "is-removable" : ""}`} style={{ "--category-color": category.color }} key={category.id}>
            <span className="category-choice-label">{category.name}</span>
            {canRemoveChips && (
              <button className="category-choice-remove" type="button" onClick={(event) => removeSelected(event, category.id)} aria-label={`Remover ${category.name}`}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {hiddenSelectedCount > 0 && (
          <span className="category-choice-chip is-summary"><span className="category-choice-label">+{hiddenSelectedCount}</span></span>
        )}
      </>
    );
  })();

  const toggleOpen = () => { setSearch(""); setOpen((current) => !current); };

  const handleTriggerKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleOpen();
  };

  return (
    <div className={`category-select category-multi-select ${open ? "open" : ""} ${className}`.trim()} ref={rootRef} onBlurCapture={handleFocusLeave}>
      <div className="category-multi-desktop-control">
        <div className="category-multi-trigger" role="combobox" tabIndex={0} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={toggleOpen} onKeyDown={handleTriggerKeyDown}>
          <span className="category-multi-values">{selectedValues}</span>
          <ChevronDown className="category-multi-chevron" size={15} />
        </div>
        {clearable && !!selected.length && <button className="category-multi-clear" type="button" onClick={clear} aria-label={`Limpar ${ariaLabel.toLocaleLowerCase("pt-BR")}`} title={`Limpar ${ariaLabel.toLocaleLowerCase("pt-BR")}`}><X size={14} /></button>}
      </div>

      <div className="category-multi-native-control">
        <div className="category-multi-native-row">
          <div className="category-multi-native-picker">
            <div className="category-multi-trigger" aria-hidden="true">
              <span className="category-multi-values">{selectedValues}</span>
              <ChevronDown className="category-multi-chevron" size={15} />
            </div>
            <select value={multiple ? "" : String(value || "")} onChange={handleNativeSelect} aria-label={`Selecionar ${ariaLabel.toLocaleLowerCase("pt-BR")}`}>
              {multiple && <option value="">Selecionar categoria...</option>}
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {selectedIds.includes(String(category.id)) ? "✓ " : ""}{category.name}
                </option>
              ))}
              {onCreate && <option value="__create__">+ Nova categoria</option>}
            </select>
          </div>
          {clearable && !!selected.length && <button className="category-multi-clear" type="button" onClick={clear} aria-label={`Limpar ${ariaLabel.toLocaleLowerCase("pt-BR")}`}><X size={14} /></button>}
        </div>
        {renderBulkActions()}
      </div>

      {open && createPortal(
        <div className="category-multi-menu" style={menuPosition} ref={menuRef}>
          <div className="category-multi-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder.replace(/\.\.\.$/, "")}
            />
          </div>
          {renderBulkActions()}
          <div className="category-multi-options" role="listbox" aria-label={ariaLabel} aria-multiselectable={multiple}>
            {filteredCategories.map((category, index) => {
              const checked = selectedIds.includes(String(category.id));
              return (
                <button className={checked ? "selected" : ""} type="button" role="option" tabIndex={-1} aria-selected={checked} onClick={() => toggle(category.id)} onKeyDown={(event) => handleOptionKeyDown(event, index)} key={category.id}>
                  <i style={{ "--category-color": category.color }} />
                  <span>{category.name}</span>
                  <b>{checked && <Check size={14} />}</b>
                </button>
              );
            })}
            {!categories.length && <p>Nenhuma opção disponível.</p>}
            {!!categories.length && !filteredCategories.length && <p>Nenhuma opção encontrada.</p>}
          </div>
          {onCreate && <button className="category-multi-create" type="button" onClick={() => { setOpen(false); setCreating(true); }}><Plus size={14} /> Nova categoria</button>}
        </div>,
        document.body,
      )}
      {creating && (
        <CategoryModal
          onSave={create}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
