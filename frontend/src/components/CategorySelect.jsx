import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import CategoryModal, { CATEGORY_COLORS } from "../modals/CategoryModal.jsx";

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

export default function CategorySelect({ categories = [], value = "", values, onChange, onCreate, className = "" }) {
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
    onChange?.(selectedIds.includes(id)
      ? selectedIds.filter((current) => current !== id)
      : [...selectedIds, id]);
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

  const handleNativeSelect = (event) => {
    const nextValue = event.target.value;
    if (!nextValue) return;
    if (nextValue === "__create__") {
      setCreating(true);
      return;
    }
    toggle(nextValue);
  };

  const selectedValues = selected.length ? selected.map((category) => (
    <span className="category-choice-chip" style={{ "--category-color": category.color }} key={category.id}>
      {category.name}
    </span>
  )) : <span className="category-multi-placeholder">Sem categoria</span>;

  return (
    <div className={`category-select category-multi-select ${open ? "open" : ""} ${className}`.trim()} ref={rootRef}>
      <div className="category-multi-desktop-control">
        <button className="category-multi-trigger" type="button" onClick={() => { setSearch(""); setOpen((current) => !current); }} aria-haspopup="listbox" aria-expanded={open}>
          <span className="category-multi-values">{selectedValues}</span>
          <ChevronDown className="category-multi-chevron" size={15} />
        </button>
        {!!selected.length && <button className="category-multi-clear" type="button" onClick={clear} aria-label="Limpar categorias"><X size={14} /><span>Limpar</span></button>}
      </div>

      <div className="category-multi-native-control">
        <div className="category-multi-native-picker">
          <div className="category-multi-trigger" aria-hidden="true">
            <span className="category-multi-values">{selectedValues}</span>
            <ChevronDown className="category-multi-chevron" size={15} />
          </div>
          <select value="" onChange={handleNativeSelect} aria-label="Selecionar ou remover categoria">
            <option value="">Selecionar categoria...</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {selectedIds.includes(String(category.id)) ? "✓ " : ""}{category.name}
              </option>
            ))}
            {onCreate && <option value="__create__">+ Nova categoria</option>}
          </select>
        </div>
        {!!selected.length && <button className="category-multi-clear" type="button" onClick={clear} aria-label="Limpar categorias"><X size={14} /><span>Limpar</span></button>}
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
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="Buscar categoria..."
              aria-label="Buscar categoria"
            />
          </div>
          <div className="category-multi-options" role="listbox" aria-label="Categorias" aria-multiselectable="true">
            {filteredCategories.map((category) => {
              const checked = selectedIds.includes(String(category.id));
              return (
                <button className={checked ? "selected" : ""} type="button" role="option" aria-selected={checked} onClick={() => toggle(category.id)} key={category.id}>
                  <i style={{ "--category-color": category.color }} />
                  <span>{category.name}</span>
                  <b>{checked && <Check size={14} />}</b>
                </button>
              );
            })}
            {!categories.length && <p>Nenhuma categoria cadastrada.</p>}
            {!!categories.length && !filteredCategories.length && <p>Nenhuma categoria encontrada.</p>}
          </div>
          {onCreate && <button className="category-multi-create" type="button" onClick={() => { setOpen(false); setCreating(true); }}><Plus size={14} /> Nova categoria</button>}
        </div>,
        document.body,
      )}
      {creating && (
        <CategoryModal
          suggestedColor={CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]}
          onSave={create}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
