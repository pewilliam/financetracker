import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import MonthlyFlowDetailsModal from "./MonthlyFlowDetailsModal.jsx";

const days = [
  {
    date: "2026-09-03",
    transactions: [
      { id: 1, type: "expense", amount: "30.00", description: "Mercado", category: { id: 1, name: "Alimentação" }, wallet: { name: "Conta" } },
      { id: 2, type: "expense", amount: "20.00", description: "Ônibus", category: { id: 2, name: "Transporte" } },
      { id: 3, type: "income", amount: "500.00", description: "Freelance" },
    ],
  },
  {
    date: "2026-09-18",
    transactions: [
      { id: 4, type: "expense", amount: "40.00", description: "Internet", wallet: { name: "Cartão" } },
    ],
  },
];

describe("MonthlyFlowDetailsModal", () => {
  it("groups expenses by day and shows each daily subtotal", () => {
    render(<MonthlyFlowDetailsModal days={days} type="expense" total="90.00" language="pt-BR" year={2026} month={9} onClose={() => {}} />);

    expect(screen.getByRole("heading", { name: "Gastos por dia" })).toBeTruthy();
    expect(screen.getByText("Movimentação").parentElement).toHaveTextContent("3lançamentos");
    expect(screen.getByText("Distribuição").parentElement).toHaveTextContent("2dias com gastos");
    expect(screen.getByText("Mercado")).toBeTruthy();
    expect(screen.getByText("Ônibus")).toBeTruthy();
    expect(screen.getByText("Internet")).toBeTruthy();
    expect(screen.queryByText("Freelance")).toBeNull();

    const third = screen.getByRole("region", { name: /03.*set/i });
    const thirdHeader = within(third).getByRole("heading", { name: /quinta-feira, 03 de setembro/i }).closest("header");
    expect(thirdHeader).toHaveTextContent("03");
    expect(thirdHeader).toHaveTextContent("QUI");
    expect(thirdHeader).toHaveTextContent(/2 lançamentos\s*·\s*R\$\s*50,00/);
    expect(within(thirdHeader).queryByText("Total do dia")).toBeNull();
    const eighteenth = screen.getByRole("region", { name: /18.*set/i });
    const eighteenthHeader = within(eighteenth).getByRole("heading", { name: /sexta-feira, 18 de setembro/i }).closest("header");
    expect(eighteenthHeader).toHaveTextContent(/1 lançamento\s*·\s*R\$\s*40,00/);
  });

  it("keeps transactions read-only", () => {
    render(<MonthlyFlowDetailsModal days={days} type="income" total="500.00" language="pt-BR" year={2026} month={9} onClose={() => {}} />);

    expect(screen.getByText("Freelance").closest("article")).toHaveClass("monthly-flow-entry");
    expect(screen.queryByRole("button", { name: /Freelance/i })).toBeNull();
  });
});
