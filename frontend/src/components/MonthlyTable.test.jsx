import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../i18n/index.ts";
import MonthlyTable from "../components/MonthlyTable.jsx";
import { getDayWallets } from "../api/api.js";

vi.mock("../api/api.js", () => ({
  getDayWallets: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.setItem("kashy365-language", "pt-BR");
});

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function renderTable(summary) {
  const date = todayIso();
  return render(
    <I18nProvider>
      <MonthlyTable
        days={[{
          date,
          expenses: "26.00",
          income: "0.00",
          balance: "974.00",
          projected_balance: "974.00",
          transactions: [],
          planned_receivables: [],
        }]}
        summary={summary}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </I18nProvider>,
  );
}

describe("daily wallet balance", () => {
  beforeEach(() => {
    getDayWallets.mockResolvedValue({
      date: todayIso(),
      consolidated_balance: "974.00",
      wallets_total: "974.00",
      wallets: [{
        wallet_id: 1,
        wallet_name: "Conta principal",
        color: "#14A078",
        balance_before: "1000.00",
        variation: "-26.00",
        balance: "974.00",
        changed: true,
        reasons: ["expense"],
        movements: [{
          kind: "expense",
          amount: "-26.00",
          description: "Ônibus",
          date: todayIso(),
          counterpart_archived: false,
        }],
      }],
    });
  });

  it("opens the modal and shows the wallet variation", async () => {
    const user = userEvent.setup();
    renderTable({ total_income: "0.00", total_expenses: "26.00", projected_closing: "974.00", current_balance: "974.00" });

    await user.click(screen.getByRole("button", { name: /ver saldo por carteira/i }));

    expect(await screen.findByRole("heading", { name: "Saldo por carteira" })).toBeTruthy();
    expect(screen.getByText("Conta principal")).toBeTruthy();
    expect(screen.queryByText("Ônibus")).toBeNull();
    await user.click(screen.getByRole("button", { name: /conta principal/i }));
    expect(screen.getByText("Gasto")).toBeTruthy();
    expect(screen.getByText("Ônibus")).toBeTruthy();
    expect(screen.getAllByText(/-R\$\s*26,00/).length).toBeGreaterThan(0);
    expect(screen.getByText("Início do dia")).toBeTruthy();
    expect(screen.getByText("Fim do dia")).toBeTruthy();
  });

  it("updates the dashboard balance after the summary refreshes", async () => {
    const user = userEvent.setup();
    const view = renderTable({ total_income: "0.00", total_expenses: "26.00", projected_closing: "974.00", current_balance: "974.00" });
    await user.click(screen.getByRole("button", { name: /ver saldo por carteira/i }));
    expect(await screen.findByText("Fim do dia")).toBeTruthy();

    view.rerender(
      <I18nProvider>
        <MonthlyTable
          days={[{
            date: todayIso(),
            expenses: "26.00",
            income: "80.00",
            balance: "1054.00",
            projected_balance: "1054.00",
            transactions: [],
            planned_receivables: [],
          }]}
          summary={{ total_income: "80.00", total_expenses: "26.00", projected_closing: "1054.00", current_balance: "1054.00" }}
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Fechamento/)).toHaveTextContent("1.054,00");
    });
  });
});

function isoOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function entryDay(date, transactions) {
  return {
    date,
    expenses: "0.00",
    income: "0.00",
    balance: "0.00",
    projected_balance: "0.00",
    transactions,
    planned_receivables: [],
  };
}

describe("dragging an expense to another day", () => {
  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: query.includes("min-width"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    });
  });

  function renderDays(onMoveExpense = () => {}) {
    const source = isoOffset(0);
    const target = isoOffset(1);
    const expense = { id: 7, date: source, type: "expense", amount: "12.00", description: "Mercado" };
    const income = { id: 8, date: source, type: "income", amount: "40.00", description: "Salário" };
    const invoiceExpense = { id: 9, date: source, type: "expense", amount: "100.00", description: "Fatura Nubank", invoice_id: 3 };
    const paidInvoiceExpense = { id: 10, date: source, type: "expense", amount: "50.00", description: "Fatura paga", invoice_id: 4 };
    render(
      <I18nProvider>
        <MonthlyTable
          days={[
            entryDay(source, [expense, income, invoiceExpense, paidInvoiceExpense]),
            entryDay(target, []),
          ]}
          invoices={[
            { id: 3, due_date: isoOffset(5), paid: false, payment_date: source },
            { id: 4, due_date: isoOffset(-2), paid: true, payment_date: source },
          ]}
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          onMoveExpense={onMoveExpense}
        />
      </I18nProvider>,
    );
    return { source, target, expense, invoiceExpense };
  }

  it("moves an expense and an open invoice onto another day", () => {
    const onMoveExpense = vi.fn();
    const { target, expense, invoiceExpense } = renderDays(onMoveExpense);
    const targetDay = document.querySelector(`[data-day="${target}"]`);

    const mercado = screen.getByRole("button", { name: /ver detalhes de mercado/i });
    expect(mercado).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(mercado);
    fireEvent.dragOver(targetDay);
    expect(targetDay).toHaveClass("is-drop-target");
    fireEvent.drop(targetDay);
    expect(onMoveExpense).toHaveBeenCalledWith(expense, target);

    const invoice = screen.getByRole("button", { name: /ver detalhes de fatura nubank/i });
    expect(invoice).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(invoice);
    fireEvent.drop(targetDay);
    expect(onMoveExpense).toHaveBeenCalledWith(invoiceExpense, target);
  });

  it("does not drag income, paid invoices, or a drop on the same day", () => {
    const onMoveExpense = vi.fn();
    const { source } = renderDays(onMoveExpense);

    expect(screen.getByRole("button", { name: /ver detalhes de salário/i })).not.toHaveAttribute("draggable");
    expect(screen.getByRole("button", { name: /ver detalhes de fatura paga/i })).not.toHaveAttribute("draggable");

    const mercado = screen.getByRole("button", { name: /ver detalhes de mercado/i });
    const sourceDay = document.querySelector(`[data-day="${source}"]`);
    fireEvent.dragStart(mercado);
    fireEvent.dragOver(sourceDay);
    fireEvent.drop(sourceDay);
    expect(sourceDay).not.toHaveClass("is-drop-target");
    expect(onMoveExpense).not.toHaveBeenCalled();
  });
});
