import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../i18n/index.ts";
import MonthsPage from "./MonthsPage.jsx";
import { MONTHS_VIEW_MODE_KEY } from "../app/constants.js";

vi.mock("../hooks/useAuth.jsx", () => ({useAuth: () => ({user: {id: 1, months_tutorial_version: 1}, completeTutorial: vi.fn().mockResolvedValue()})}));
const props = {year: 2026, month: 10, monthCards: [], monthData: {year: 2026, month: 10, days: [{date: "2026-10-01", transactions: [], planned_receivables: []}]}, openAddForm: vi.fn(), setYear: vi.fn(), setMonth: vi.fn()};
beforeEach(() => {localStorage.clear(); localStorage.setItem("kashy365-language", "pt-BR"); sessionStorage.clear();});
function show() {return render(<I18nProvider><MonthsPage {...props} /></I18nProvider>);}

it("adds Calendar alongside Table/Cards and remembers the chosen view", async () => {
  const user = userEvent.setup();
  const view = show();
  expect(screen.getByRole("button", {name: "Tabela", pressed: true})).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Calendário"}));
  expect(screen.getByRole("heading", {name: "Calendário mensal"})).toBeInTheDocument();
  expect(localStorage.getItem(MONTHS_VIEW_MODE_KEY)).toBe("calendar");
  view.unmount();
  show();
  expect(screen.getByRole("button", {name: "Calendário", pressed: true})).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Cards"}));
  expect(screen.getByRole("heading", {name: "Seus meses em perspectiva"})).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Tabela"}));
  expect(screen.getByRole("heading", {name: "Tabela mensal"})).toBeInTheDocument();
});

it("keeps Calendar when returning to today", async () => {
  const user = userEvent.setup();
  localStorage.setItem(MONTHS_VIEW_MODE_KEY, "calendar");
  show();
  await user.click(screen.getAllByRole("button", {name: "Ir para o dia de hoje"})[0]);
  expect(localStorage.getItem(MONTHS_VIEW_MODE_KEY)).toBe("calendar");
  expect(screen.getByRole("button", {name: "Calendário", pressed: true})).toBeInTheDocument();
});
