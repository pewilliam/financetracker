import { Palette } from "lucide-react";

const DEFAULT_COLOR = "#14A078";

export function normalizeColorValue(value, fallback = DEFAULT_COLOR) {
  return /^#[0-9A-F]{6}$/i.test(value || "") ? value.toUpperCase() : fallback;
}

export default function ColorPickerField({ value, onChange, label = "Cor personalizada", ariaLabel = "Escolher uma cor personalizada", disabled = false, className = "" }) {
  const color = normalizeColorValue(value);

  return (
    <label className={`custom-color-picker ${className}`.trim()}>
      <input
        type="color"
        value={color}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <span><strong>{label}</strong><small>{color}</small></span>
      <Palette size={18} />
    </label>
  );
}
