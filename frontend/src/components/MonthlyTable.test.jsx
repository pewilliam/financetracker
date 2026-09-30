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

describe("dragging one-off transactions to another day", () => {
  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: query.includes("min-width"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    });
  });

  function renderDays(onMoveTransaction = () => {}) {
    const source = isoOffset(0);
    const target = isoOffset(1);
    const expense = { id: 7, date: source, type: "expense", amount: "12.00", description: "Mercado" };
    const income = { id: 8, date: source, type: "income", amount: "40.00", description: "Salário" };
    const invoiceExpense = { id: 9, date: source, type: "expense", amount: "100.00", description: "Fatura Nubank", invoice_id: 3 };
    const recurringExpense = { id: 10, date: source, type: "expense", amount: "50.00", description: "Academia", recurrence_id: 4 };
    const plannedReceivable = {
      id: 11,
      description: "Freelance",
      remaining_amount: "250.00",
      series_installment_count: 1,
    };
    render(
      <I18nProvider>
        <MonthlyTable
          days={[
            { ...entryDay(source, [expense, income, invoiceExpense, recurringExpense]), planned_receivables: [plannedReceivable] },
            entryDay(target, []),
          ]}
          invoices={[{ id: 3, due_date: isoOffset(5), paid: false, payment_date: source }]}
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          onMoveTransaction={onMoveTransaction}
        />
      </I18nProvider>,
    );
    return { source, target, expense, income };
  }

  it("moves one-off expenses and income onto another day", () => {
    const onMoveTransaction = vi.fn();
    const { target, expense, income } = renderDays(onMoveTransaction);
    const targetDay = document.querySelector(`[data-day="${target}"]`);

    const mercado = screen.getByRole("button", { name: /ver detalhes de mercado/i });
    expect(mercado).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(mercado);
    fireEvent.dragOver(targetDay);
    expect(targetDay).toHaveClass("is-drop-target");
    fireEvent.drop(targetDay);
    expect(onMoveTransaction).toHaveBeenCalledWith(expense, target);

    const salary = screen.getByRole("button", { name: /ver detalhes de salário/i });
    expect(salary).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(salary);
    fireEvent.drop(targetDay);
    expect(onMoveTransaction).toHaveBeenCalledWith(income, target);
  });

  it("does not drag invoices, recurring entries, or planned receivables", () => {
    const onMoveTransaction = vi.fn();
    renderDays(onMoveTransaction);

    expect(screen.getByRole("button", { name: /ver detalhes de fatura nubank/i })).not.toHaveAttribute("draggable");
    expect(screen.getByRole("button", { name: /ver detalhes de academia/i })).not.toHaveAttribute("draggable");
    expect(screen.getByRole("button", { name: /recebível previsto: freelance/i })).not.toHaveAttribute("draggable");
  });

  it("ignores a drop on the transaction's current day", () => {
    const onMoveTransaction = vi.fn();
    const { source } = renderDays(onMoveTransaction);

    const mercado = screen.getByRole("button", { name: /ver detalhes de mercado/i });
    const sourceDay = document.querySelector(`[data-day="${source}"]`);
    fireEvent.dragStart(mercado);
    fireEvent.dragOver(sourceDay);
    fireEvent.drop(sourceDay);
    expect(sourceDay).not.toHaveClass("is-drop-target");
    expect(onMoveTransaction).not.toHaveBeenCalled();
  });
});
