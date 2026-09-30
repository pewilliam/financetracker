import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import Dashboard from "./Dashboard.jsx";

vi.mock("./DashboardWallets.jsx", () => ({ default: () => null }));

const income = { id: 1, type: "income", amount: "900.00", description: "Salário", date: "2026-09-05" };
const expense = { id: 2, type: "expense", amount: "120.00", description: "Mercado", date: "2026-09-12" };

function renderDashboard(onOpenTransaction = () => {}) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
  return render(
    <I18nProvider>
      <Dashboard
        summary={{ year: 2026, month: 9, current_balance: "780.00", total_income: "900.00", total_expenses: "120.00", projected_closing: "780.00" }}
        monthData={{ year: 2026, month: 9, opening_balance: "0.00", closing_balance: "780.00", days: [
          { date: "2026-09-05", balance: "900.00", transactions: [income] },
          { date: "2026-09-12", balance: "780.00", transactions: [expense] },
        ] }}
        activeSection="wallets"
        onActiveSectionChange={() => {}}
        onOpenTransaction={onOpenTransaction}
        onNewTransaction={() => {}}
      />
    </I18nProvider>,
  );
}

describe("dashboard flow cards", () => {
  it("opens income and expense details grouped by day", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Ver gastos por dia" }));
    const modalTitle = screen.getByRole("heading", { name: "Gastos por dia" });
    const dialog = modalTitle.closest("[role='dialog']");
    expect(dialog.querySelector(":scope > .monthly-flow-header")).toContainElement(modalTitle);
    expect(dialog.querySelector(".monthly-flow-body")).not.toContainElement(modalTitle);
    expect(screen.getByText("Mercado")).toBeTruthy();
    expect(screen.getByText("Mercado").closest("article")).toHaveClass("monthly-flow-entry");
    expect(screen.queryByRole("button", { name: /Mercado/i })).toBeNull();
    expect(screen.queryByText("Salário")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await user.click(screen.getByRole("button", { name: "Ver ganhos por dia" }));
    expect(screen.getByRole("heading", { name: "Ganhos por dia" })).toBeTruthy();
    expect(screen.getByText("Salário")).toBeTruthy();
    expect(screen.queryByText("Mercado")).toBeNull();
  });
});
