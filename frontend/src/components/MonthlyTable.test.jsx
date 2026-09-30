import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../i18n/index.ts";
import MonthlyTable from "../components/MonthlyTable.jsx";
import { getDayWallets } from "../api/api.js";

vi.mock("../api/api.js", () => ({
  getDayWallets: vi.fn(),
}));

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
