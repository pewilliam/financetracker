import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import CategoryModal, { CATEGORY_COLORS } from "../modals/CategoryModal.jsx";

function normalizeValues(value, values) {
  const source = values ?? value;
  if (Array.isArray(source)) return source.filter(Boolean).map(String);
  return source ? [String(source)] : [];
}

export default function CategorySelect({ categories = [], value = "", values, onChange, onCreate, className = "" }) {
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({});
  const [creating, setCreating] = useState(false);
  const selectedIds = useMemo(() => normalizeValues(value, values), [value, values]);
  const selected = categories.filter((category) => selectedIds.includes(String(category.id)));

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = 280;
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

  return (
    <div className={`category-select category-multi-select ${open ? "open" : ""} ${className}`.trim()} ref={rootRef}>
      <button className="category-multi-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="category-multi-values">
          {selected.length ? selected.map((category) => (
            <span className="category-choice-chip" style={{ "--category-color": category.color }} key={category.id}>
              {category.name}
              <X size={12} role="button" aria-label={`Remover ${category.name}`} onClick={(event) => { event.stopPropagation(); toggle(category.id); }} />
            </span>
          )) : <span className="category-multi-placeholder">Sem categoria</span>}
        </span>
        <ChevronDown className="category-multi-chevron" size={15} />
      </button>

      {open && createPortal(
        <div className="category-multi-menu" style={menuPosition} ref={menuRef} role="listbox" aria-label="Categorias" aria-multiselectable="true">
          <div className="category-multi-options">
            {categories.map((category) => {
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
