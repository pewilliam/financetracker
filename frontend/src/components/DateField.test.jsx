import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import DateField from "./DateField.jsx";

function show(props = {}) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
  return render(<I18nProvider><DateField ariaLabel="Data" value="2026-10-06" onChange={vi.fn()} {...props} /></I18nProvider>);
}

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false }));
});

it("jumps directly to a selected month and year", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  show({ onChange });

  await user.click(screen.getByRole("textbox", { name: "Data" }));
  await user.click(screen.getByRole("button", { name: "Selecionar mês, Outubro" }));
  await user.click(screen.getByRole("option", { name: "Fev" }));
  await user.click(screen.getByRole("button", { name: "Selecionar ano, 2026" }));
  const yearGrid = document.querySelector(".date-year-options");
  expect([...yearGrid.children].findIndex((option) => option.getAttribute("aria-selected") === "true") % 3).toBe(1);
  await user.click(screen.getByRole("option", { name: "2024" }));

  const day = [...document.querySelectorAll(".date-days button")].find((button) => button.textContent === "20" && !button.classList.contains("muted"));
  await user.click(day);
  expect(onChange).toHaveBeenCalledWith("2024-02-20");
});

it("does not navigate beyond the maximum date", async () => {
  const user = userEvent.setup();
  show({ max: "2026-10-06" });

  await user.click(screen.getByRole("textbox", { name: "Data" }));
  expect(screen.getByRole("button", { name: "Proximo mes" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Selecionar mês, Outubro" }));
  expect(screen.getByRole("option", { name: "Nov" })).toBeDisabled();
});

it("resets the year panel when reopening and limits the available range", async () => {
  const user = userEvent.setup();
  show();

  await user.click(screen.getByRole("textbox", { name: "Data" }));
  await user.click(screen.getByRole("button", { name: "Selecionar ano, 2026" }));
  expect(screen.getByRole("option", { name: "2000" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "2100" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "1999" })).not.toBeInTheDocument();

  await user.click(document.body);
  await user.click(screen.getByRole("textbox", { name: "Data" }));
  expect(screen.queryByRole("listbox", { name: "Ano" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Selecionar ano, 2026" }));
  expect(screen.getByRole("option", { name: "2026" })).toHaveAttribute("aria-selected", "true");
});

it("navigates days and weeks with arrows, then selects with Enter", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  show({ onChange });
  await user.click(screen.getByRole("textbox", { name: "Data" }));
  const input = screen.getByRole("textbox", { name: "Data" });
  await user.keyboard("{ArrowDown}");
  await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toMatch(/outubro de 2026/i));
  await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("2026-10-14");
  expect(document.querySelector(".date-day-popover")).not.toBeInTheDocument();
  expect(input).toHaveFocus();
});

it("closes only the date picker on Escape without changing the date", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  show({ onChange });
  const input = screen.getByRole("textbox", { name: "Data" });
  await user.click(input);
  await user.keyboard("{ArrowDown}");
  await waitFor(() => expect(document.activeElement).not.toBe(input));
  await user.keyboard("{Escape}");
  expect(document.querySelector(".date-day-popover")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  expect(input).toHaveFocus();
});

it("commits an edited date on blur outside the calendar", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  show({ onChange });
  const input = screen.getByRole("textbox", { name: "Data" });
  await user.clear(input);
  await user.type(input, "15102026");
  expect(input).toHaveValue("15/10/2026");

  // The open calendar is part of the date field. Leaving it for a separate
  // control, rather than tabbing into the calendar, commits the typed date.
  const nextField = document.createElement("button");
  nextField.type = "button";
  nextField.textContent = "Próximo campo";
  document.body.appendChild(nextField);
  try {
    await user.click(nextField);
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
  } finally {
    nextField.remove();
  }
});
