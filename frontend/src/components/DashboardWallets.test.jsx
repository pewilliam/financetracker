import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../i18n/index.ts";
import DashboardWallets from "./DashboardWallets.jsx";
import { getDashboardWallets } from "../api/api.js";

vi.mock("../api/api.js", () => ({
  getDashboardWallets: vi.fn(),
}));

function renderSection(props = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <DashboardWallets year={2026} month={9} {...props} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

const checking = {
  wallet_id: 5,
  name: "Conta principal",
  type: "checking",
  institution: "Banco",
  color: "#14A078",
  active: true,
  current_balance: "1260.00",
  period_income: "300.00",
  period_expenses: "40.00",
  period_adjustments: "0.00",
  period_variation: "260.00",
  changed_in_period: true,
};

describe("dashboard wallets", () => {
  beforeEach(() => {
    getDashboardWallets.mockReset();
  });

  it("renders each active wallet with balance, income, expenses and change", async () => {
    getDashboardWallets.mockResolvedValue({
      total_balance: "1260.00",
      active_count: 1,
      wallets: [checking],
    });

    renderSection();

    expect(await screen.findByRole("heading", { name: "Carteiras" })).toBeTruthy();
    expect(screen.getByText("Conta principal")).toBeTruthy();
    expect(screen.getByText("Banco")).toBeTruthy();
    expect(screen.getByText("Movimentou")).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*1\.260,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s*300,00/)).toBeTruthy();
    expect(screen.getByText(/R\$\s*40,00/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /ver carteiras/i })).toHaveAttribute("href", "/carteiras");
  });

  it("shows the empty state when there are no active wallets", async () => {
    getDashboardWallets.mockResolvedValue({ total_balance: "0.00", active_count: 0, wallets: [] });

    renderSection();

    expect(await screen.findByText("Nenhuma carteira ativa")).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir carteiras/i })).toHaveAttribute("href", "/carteiras");
  });

  it("hides archived wallets, lists today's transactions and refreshes after a change", async () => {
    getDashboardWallets.mockResolvedValueOnce({
      total_balance: "1260.00",
      active_count: 1,
      wallets: [
        checking,
        { ...checking, wallet_id: 9, name: "Antiga", active: false, current_balance: "50.00", changed_in_period: false },
      ],
    }).mockResolvedValueOnce({
      total_balance: "900.00",
      active_count: 1,
      wallets: [{ ...checking, current_balance: "900.00", period_variation: "-100.00" }],
    });

    const view = renderSection({
      refreshKey: 0,
      dayTransactions: [
        { id: 1, description: "Ônibus", type: "expense", amount: "14.00", date: "2026-09-23", wallet: { id: 5, name: "Conta principal" } },
        { id: 2, description: "Café", type: "expense", amount: "8.00", date: "2026-09-23", wallet: { id: 6, name: "Dinheiro" } },
      ],
    });

    expect((await screen.findAllByText("Conta principal")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Antiga")).toBeNull();
    expect(screen.getByText("Transações de hoje")).toBeTruthy();
    expect(screen.getAllByText("Ganhos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gastos").length).toBeGreaterThan(0);
    expect(screen.getByText("Ônibus")).toBeTruthy();
    expect(screen.getByText("Dinheiro")).toBeTruthy();
    expect(screen.getByText("Café")).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*1\.260,00/).length).toBeGreaterThan(0);

    view.rerender(
      <MemoryRouter>
        <I18nProvider>
          <DashboardWallets year={2026} month={9} refreshKey={1} />
        </I18nProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/R\$\s*900,00/)).toBeTruthy());
    expect(getDashboardWallets).toHaveBeenCalledTimes(2);
  });
});
