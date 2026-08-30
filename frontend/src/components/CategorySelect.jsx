import { useState } from "react";
import CategoryModal, { CATEGORY_COLORS } from "../modals/CategoryModal.jsx";

export default function CategorySelect({ categories = [], value = "", onChange, onCreate, className = "" }) {
  const [creating, setCreating] = useState(false);

  const choose = (event) => {
    if (event.target.value === "__new__") {
      setCreating(true);
      return;
    }
    onChange?.(event.target.value);
  };

  const create = async (payload) => {
    const category = await onCreate(payload);
    onChange?.(String(category.id));
    setCreating(false);
  };

  return (
    <div className={`category-select ${className}`.trim()}>
      <select value={value || ""} onChange={choose} aria-label="Categoria">
        <option value="">Sem categoria</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
        {onCreate && <option value="__new__">Criar nova categoria...</option>}
      </select>
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
