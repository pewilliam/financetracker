export function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(amount);
}

export function formatMonthLabel(year, month) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
}

export function formatDateShort(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("pt-BR");
}

export function formatDateWithWeekday(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const text = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });
  return text.replace(".", "");
}

export function parseMoneyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0) / 100;
}

export function formatMoneyInput(value) {
  return formatMoney(parseMoneyInput(value));
}

export function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  const diff = Math.round((target - today) / 86400000);
  if (diff < 0) return "Vencida";
  if (diff === 0) return "Vence hoje";
  return `em ${diff} dias`;
}
