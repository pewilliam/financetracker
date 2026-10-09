import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import InstallmentDetailsModal from "./InstallmentDetailsModal.jsx";

const purchase = {
  id: 7,
  description: "Nome antigo",
  total_amount: "250.00",
  installment_count: 2,
  installment_value: "125.00",
  paid_installments: 0,
  paid_amount: "0.00",
  remaining_amount: "250.00",
  category_ids: [],
  categories: [],
  items: [
    { id: 71, installment_number: 1, amount: "125.00", description: "Nome antigo (1/2)", status: "pending", invoice: null },
    { id: 72, installment_number: 2, amount: "125.00", description: "Nome antigo (2/2)", status: "pending", invoice: null },
  ],
};

describe("InstallmentDetailsModal", () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it("edits the purchase name from the purchase editor", async () => {
    const user = userEvent.setup();
    const onSavePurchase = vi.fn().mockResolvedValue({ ...purchase, description: "Nome novo" });

    render(
      <I18nProvider>
        <InstallmentDetailsModal
          purchase={purchase}
          invoices={[]}
          categories={[]}
          onClose={() => {}}
          onRequestDelete={() => {}}
          onSaveItem={() => {}}
          onSaveCategory={() => {}}
          onSavePurchase={onSavePurchase}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /editar compra/i }));
    const name = screen.getByRole("textbox", { name: /nome da compra/i });
    await user.clear(name);
    await user.type(name, "Nome novo");
    await user.click(screen.getByRole("button", { name: /salvar edição/i }));

    await waitFor(() => expect(onSavePurchase).toHaveBeenCalledWith(7, { description: "Nome novo" }));
    expect(screen.getByRole("button", { name: /remover/i })).toHaveClass("installment-delete-action");
  });
});
