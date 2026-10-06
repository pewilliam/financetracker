import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
