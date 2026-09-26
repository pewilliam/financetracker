import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import ProjectionBreakdownModal from "./ProjectionBreakdownModal.jsx";

describe("ProjectionBreakdownModal", () => {
  it("explains the difference between actual and projected closing", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <ProjectionBreakdownModal
          summary={{
            total_income: "1000.00",
            total_expenses: "200.00",
            transactions_projected_closing: "800.00",
            planned_receivables_total: "100.00",
            open_invoices_projected_total: "50.00",
            projected_closing: "850.00",
            projection_receivables: [],
            projection_invoices: [],
          }}
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /entenda a diferença/i }));

    const explanation = screen.getByRole("note");
    expect(explanation).toHaveTextContent("Por que os valores são diferentes?");
    expect(explanation).toHaveTextContent("movimentações já cadastradas para o mês");
    expect(explanation).toHaveTextContent("soma os valores que você ainda espera receber");
    expect(explanation).toHaveTextContent("ainda são expectativas");
  });
});
