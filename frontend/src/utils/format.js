let activeLocale = "pt-BR";

export function setFormatLocale(locale) {
  activeLocale = locale || "pt-BR";
}

export function getFormatLocale() {
  return activeLocale;
}

export function formatMoney(value, locale = activeLocale) {
  const amount = Number(value || 0);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL"
  });

  if (locale === "en-US") {
    return formatter.formatToParts(amount).map((part) => (
      part.type === "currency" ? `${part.value} ` : part.value
    )).join("");
  }

  return formatter.format(amount);
}

export function formatMonthLabel(year, month, locale = activeLocale) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(locale, {
    month: "long",
    year: "numeric"
  });
}

export function formatDateShort(dateString, locale = activeLocale) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(locale);
}

export function formatDateWithWeekday(dateString, locale = activeLocale) {
  const date = new Date(`${dateString}T00:00:00`);
  const text = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(date);

  if (locale === "pt-BR") {
    return text
      .replace(/^\w/, (char) => char.toUpperCase())
      .replace(/^([\wÀ-ÿ]+)\.,/u, "$1,");
  }

  return text.replace(".", "");
}

export function parseMoneyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0) / 100;
}

export function parseTypedMoneyInput(value, locale = activeLocale) {
  const text = String(value || "").trim();
  if (!text) return 0;

  const decimalSeparator = locale === "en-US" ? "." : ",";
  if (text.includes(decimalSeparator)) {
    const [integerPart, decimalPart = ""] = text.split(decimalSeparator);
    const integer = integerPart.replace(/\D/g, "") || "0";
    const decimal = decimalPart.replace(/\D/g, "").slice(0, 2).padEnd(2, "0");
    return Number(`${integer}.${decimal}`);
  }

  if (text.includes(",")) return parseMoneyInput(text);
  return Number(text.replace(/\D/g, "") || 0);
}

export function formatMoneyInput(value, locale = activeLocale) {
  return formatMoney(parseMoneyInput(value), locale);
}

export function getDaysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

export function daysUntil(dateString, locale = activeLocale) {
  const diff = getDaysUntil(dateString);
  if (locale === "en-US") {
    if (diff < 0) return "Overdue";
    if (diff === 0) return "Due today";
    return `in ${diff} days`;
  }
  if (diff < 0) return "Vencida";
  if (diff === 0) return "Vence hoje";
  return `em ${diff} dias`;
}
