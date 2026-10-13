import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n/index.ts";
import MonthCalendar from "./MonthCalendar.jsx";

const date = "2026-10-13";
const transactions = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, date, type: index % 2 ? "income" : "expense", amount: "25.00", description: `Lançamento ${index + 1}` }));
const receivable = { id: 1, description: "Pagamento previsto", person_name: "Maria", remaining_amount: "50.00", due_date: date };
const day = { date, balance: "100.00", transactions, planned_receivables: [receivable] };
function show(props = {}) {
  return render(<I18nProvider><MonthCalendar days={[day]} year={2026} month={10} {...props} /></I18nProvider>);
}
beforeEach(() => {
  localStorage.setItem("kashy365-language", "pt-BR");
  window.matchMedia = vi.fn(() => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
});

it("limits the combined transaction/receivable preview to two and lists the selected day in the modal", async () => {
  const user = userEvent.setup();
  show();
  const cell = screen.getByRole("cell", { name: "13 de outubro de 2026" });
  expect(within(cell).getAllByRole("button", {name: /^Ver detalhes:/})).toHaveLength(2);
  expect(within(cell).queryByText("Lançamento 6")).not.toBeInTheDocument();
  await user.click(within(cell).getByRole("button", { name: /^Abrir todos/ }));
  const modal = screen.getByRole("dialog", {name: "Lançamentos do dia"});
  expect(within(modal).getByText(/13 de outubro de 2026/)).toBeInTheDocument();
  expect(within(modal).getAllByRole("button", {name: /^Ver detalhes:/})).toHaveLength(7);
  expect(within(modal).getByText("Lançamento 6")).toBeInTheDocument();
  expect(within(modal).getByText("Pagamento previsto")).toBeInTheDocument();
  expect(document.body.style.overflow).toBe("hidden");
  await waitFor(() => expect(within(modal).getAllByRole("button", {name: "Fechar", exact: true})[0]).toHaveFocus());
  within(modal).getAllByRole("button", {name: "Fechar", exact: true})[0].focus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(within(modal).getByRole("button", {name: "Adicionar lançamento"})).toHaveFocus();
  await user.tab();
  expect(within(modal).getAllByRole("button", {name: "Fechar", exact: true})[0]).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(within(cell).getByRole("button", {name: /^Abrir todos/})).toHaveFocus();
});

it("counts expected receivables toward the two-item limit and hides More at exactly two", () => {
  show({days: [{...day, transactions: transactions.slice(0, 1)}]});
  const cell = screen.getByRole("cell", {name: "13 de outubro de 2026"});
  expect(within(cell).getAllByRole("button", {name: /^Ver detalhes:/})).toHaveLength(2);
  expect(within(cell).getByText("Pagamento previsto")).toBeInTheDocument();
  expect(within(cell).queryByRole("button", {name: /^Abrir todos/})).not.toBeInTheDocument();
});

it.each([[2024, 2, 29, 4], [2025, 2, 28, 6], [2026, 11, 30, 0]])("shows every day in %i/%i with the correct weekday alignment", (year, month, length, blankCells) => {
  show({year, month, days: []});
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("cell").filter(cell => cell.hasAttribute("data-day"))).toHaveLength(length);
  expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
  expect(table.querySelector('.month-calendar-week').querySelectorAll('.is-outside')).toHaveLength(blankCells);
});

it("opens a planned receivable from the day modal without leaving it behind", async () => {
  const user = userEvent.setup();
  const onOpenReceivable = vi.fn();
  const overlay = vi.fn();
  show({onOpenReceivable, onOverlayChange: overlay});
  await user.click(screen.getByRole("button", {name: /^Abrir todos/}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: /Ver detalhes: Recebível previsto/}));
  expect(onOpenReceivable).toHaveBeenCalledWith(receivable);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(overlay).toHaveBeenCalledWith(false);
});

it("adds an entry using the selected day and updates an already open day from refreshed data", async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  const view = show({onAdd});
  await user.click(screen.getByRole("button", {name: /^Abrir todos/}));
  const updated = {...day, transactions: transactions.filter(item => item.id !== 6)};
  view.rerender(<I18nProvider><MonthCalendar days={[updated]} year={2026} month={10} onAdd={onAdd} /></I18nProvider>);
  const modal = screen.getByRole("dialog");
  expect(within(modal).queryByText("Lançamento 6")).not.toBeInTheDocument();
  await user.click(within(modal).getByRole("button", {name: "Adicionar lançamento"}));
  expect(onAdd).toHaveBeenCalledWith(date);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("discards the previous month's data and closes its day when the period changes", async () => {
  const user = userEvent.setup();
  const view = show();
  await user.click(screen.getByRole("button", {name: /^Abrir todos/}));
  view.rerender(<I18nProvider><MonthCalendar days={[day]} year={2026} month={11} /></I18nProvider>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Lançamento 1")).not.toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveAccessibleName("novembro de 2026");
});

it("opens the existing transaction details and forwards edit to the original handler", async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  show({onEdit});
  await user.click(screen.getByRole("button", {name: /Ver detalhes: Gasto · Lançamento 1/}));
  const modal = screen.getByRole("dialog");
  await user.click(within(modal).getByRole("button", {name: /Editar/}));
  expect(onEdit).toHaveBeenCalledWith(transactions[0]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens every day by its number and keeps empty cells clean", async () => {
  const user = userEvent.setup();
  show();
  const empty = screen.getByRole("cell", {name: "12 de outubro de 2026"});
  expect(within(empty).queryByText("Sem lançamentos")).not.toBeInTheDocument();
  await user.click(within(empty).getByRole("button", {name: /^Abrir dia/}));
  expect(within(screen.getByRole("dialog")).getByText("Saldo do dia")).toBeInTheDocument();
  expect(within(screen.getByRole("dialog")).getByText("Variação do dia")).toBeInTheDocument();
});

it("filters the preview without changing the complete day modal or financial totals", async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole("button", {name: "Ganhos", pressed: true}));
  expect(screen.getByRole("button", {name: "Ganhos", pressed: false})).toBeInTheDocument();
  const cell = screen.getByRole("cell", {name: "13 de outubro de 2026"});
  const preview = within(cell).getAllByRole("button", {name: /^Ver detalhes:/});
  expect(preview.every(button => button.getAttribute("aria-label").includes("Gasto"))).toBe(true);
  await user.click(within(cell).getByRole("button", {name: /^Abrir dia/}));
  expect(within(screen.getByRole("dialog")).getAllByRole("button", {name: /^Ver detalhes:/})).toHaveLength(7);
});

it("shows month/week summaries, links the minimum balance day and can disable the heatmap", async () => {
  const user = userEvent.setup();
  show({days: [{...day, date: "2026-10-01", balance: -10}, {...day, date: "2026-10-02", balance: -50}], summary: {total_income: 150, total_expenses: 150, projected_closing: 0}, openingBalance: 100});
  expect(screen.getByText("Saldo final projetado")).toBeInTheDocument();
  expect(screen.getAllByRole("cell", {name: /Líquido da semana/})).toHaveLength(5);
  const cell = screen.getByRole("cell", {name: "1 de outubro de 2026"});
  expect(cell.style.getPropertyValue("--calendar-heat")).toBe("15%");
  await user.click(screen.getByRole("button", {name: "Mapa de gastos", pressed: true}));
  expect(cell.style.getPropertyValue("--calendar-heat")).toBe("0%");
  await user.click(screen.getByRole("button", {name: "Dia de menor saldo: 2 de outubro de 2026"}));
  expect(within(screen.getByRole("dialog")).getByText(/2 de outubro de 2026/)).toBeInTheDocument();
});

it("moves an expected entry optimistically and restores its date on a rejected save", async () => {
  let reject;
  const onMoveEntry = vi.fn(() => new Promise((resolve, rejectSave) => {reject = rejectSave;}));
  show({days: [{...day, transactions: []}, {date: "2026-10-14", transactions: [], planned_receivables: [], balance: 100}], onMoveEntry});
  const origin = screen.getByRole("cell", {name: "13 de outubro de 2026"});
  const target = screen.getByRole("cell", {name: "14 de outubro de 2026"});
  const entry = within(origin).getByRole("button", {name: /^Ver detalhes:/});
  expect(entry).toHaveAttribute("draggable", "true");
  fireEvent.dragStart(entry, {dataTransfer: {setData: vi.fn()}});
  fireEvent.dragOver(target);
  expect(target).toHaveClass("is-drop-target");
  fireEvent.drop(target);
  expect(onMoveEntry).toHaveBeenCalledWith(expect.objectContaining({kind: "receivable", item: receivable}), "2026-10-14");
  expect(within(target).getByText("Pagamento previsto")).toBeInTheDocument();
  reject(new Error("Network error"));
  await waitFor(() => expect(within(origin).getByText("Pagamento previsto")).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent("A data original foi restaurada");
});

it("allows invoice dragging and shows its paid status with stronger invoice styling", async () => {
  const onMoveEntry = vi.fn().mockResolvedValue();
  const invoiceTx = {...transactions[0], invoice_id: 8};
  show({days: [{...day, transactions: [invoiceTx], planned_receivables: []}], invoices: [{id: 8, paid: true}], onMoveEntry});
  const entry = screen.getByRole("button", {name: /Ver detalhes: Fatura/});
  expect(entry).toHaveClass("is-invoice");
  expect(within(entry).getByRole("img", {name: "Pago"})).toBeInTheDocument();
  fireEvent.dragStart(entry, {dataTransfer: {setData: vi.fn()}});
  fireEvent.drop(screen.getByRole("cell", {name: "14 de outubro de 2026"}));
  expect(onMoveEntry).toHaveBeenCalledWith(expect.objectContaining({item: invoiceTx}), "2026-10-14");
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Data atualizada"));
});
