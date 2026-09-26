import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../../i18n/index.ts";
import MonthCard from "./MonthCard.jsx";

describe("MonthCard", () => {
  it("shows the consolidated projected closing and opens its details", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    const onOpenProjection = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <MonthCard
          item={{
            year: 2099,
            month: 10,
            label: "Outubro de 2099",
            opening_balance: "900.00",
            current_balance: "900.00",
            closing_balance: "1000.00",
            total_income: "100.00",
            total_expenses: "0.00",
            planned_receivables_total: "100.00",
            prior_planned_receivables_total: "0.00",
            open_invoices_projected_total: "50.00",
            projected_closing: "1050.00",
            transaction_count: 1,
          }}
          onView={() => {}}
          onQuickAdd={() => {}}
          onOpenProjection={onOpenProjection}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Fechamento previsto").parentElement).toHaveTextContent("R$ 1.050,00");
    expect(screen.getByText("A receber: +R$ 100,00")).toBeTruthy();
    expect(screen.getByText("Faturas previstas: −R$ 50,00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /ver detalhes da projeção/i }));
    expect(onOpenProjection).toHaveBeenCalledOnce();
  });
});
