import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultReceivableForm } from "../app/helpers.js";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import ReceivableModal from "./ReceivableModal.jsx";

const purchase = {
  source_type: "installment_purchase",
  source_id: 10,
  description: "Compra compartilhada",
  amount: "250.00",
  available_amount: "250.00",
  linked_amount: "0.00",
  receivable_ids: [],
  transaction_ids: [],
  date: "2026-11-01",
  origin: "invoice",
  invoice_name: "Nubank",
  purchase_id: 10,
  installment_count: 4,
  category_ids: [],
  categories: [],
};

const installmentOptions = Array.from({ length: 4 }, (_, index) => ({
  ...purchase,
  source_type: "installment_item",
  source_id: 101 + index,
  purchase_id: purchase.source_id,
  amount: "62.50",
  available_amount: "62.50",
  installment_number: index + 1,
}));

function Subject({ initialForm = defaultReceivableForm(), onSubmit = () => {}, options = [purchase, ...installmentOptions] }) {
  const [form, setForm] = useState(initialForm);
  return (
    <ReceivableModal
      form={form}
      setForm={setForm}
      people={[{ id: 1, name: "Ana" }]}
      categories={[]}
      expenseOptions={options}
      onSubmit={onSubmit}
      onClose={() => {}}
    />
  );
}

describe("ReceivableModal expense defaults", () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it("prefills the original purchase total split across its four installments", async () => {
    const user = userEvent.setup();
    const { container } = render(<I18nProvider><Subject /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: /buscar um gasto/i }));
    await user.type(screen.getByPlaceholderText(/digite para encontrar/i), "compra");
    await user.click(await screen.findByRole("button", { name: /compra compartilhada/i }));

    const countInput = screen.getByRole("group", { name: /quantidade de recebíveis/i }).querySelector("input");
    const amountInput = container.querySelector('.receivable-form-row input[inputmode="decimal"]');
    expect(countInput).toHaveValue("4");
    expect(amountInput).toHaveValue("R$ 250,00");
    expect(screen.getAllByText("R$ 62,50")).toHaveLength(4);
  });

  it("prefills a one-time purchase as one receivable with the full amount", async () => {
    const user = userEvent.setup();
    const singlePurchase = { ...purchase, source_id: 20, purchase_id: 20, installment_count: 1 };
    const singleItem = {
      ...installmentOptions[0],
      source_id: 201,
      purchase_id: 20,
      installment_count: 1,
      amount: "250.00",
      available_amount: "250.00",
    };
    const { container } = render(
      <I18nProvider><Subject options={[singlePurchase, singleItem]} /></I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /buscar um gasto/i }));
    await user.type(screen.getByPlaceholderText(/digite para encontrar/i), "compra");
    await user.click(await screen.findByRole("button", { name: /compra compartilhada/i }));

    const countInput = screen.getByRole("group", { name: /quantidade de recebíveis/i }).querySelector("input");
    const amountInput = container.querySelector('.receivable-form-row input[inputmode="decimal"]');
    expect(countInput).toHaveValue("1");
    expect(amountInput).toHaveValue("R$ 250,00");
    expect(screen.getByText("R$ 250,00", { selector: ".receivable-preview-row strong" })).toBeVisible();
  });

  it("requires explicit confirmation when the total exceeds the expense", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const initialForm = {
      ...defaultReceivableForm(),
      person_id: "1",
      description: "Reembolso com juros",
      total_amount: "R$ 275,00",
      due_date: "2026-12-31",
      expense_source_key: "installment_purchase:10",
      installment_scope: "all",
      series_count: 1,
    };
    render(<I18nProvider><Subject initialForm={initialForm} onSubmit={onSubmit} /></I18nProvider>);

    expect(screen.getByText(/R\$ 250,00 serão atribuídos/i)).toBeVisible();
    expect(screen.getByText(/R\$ 25,00 ficarão como valor adicional/i)).toBeVisible();
    const save = screen.getByRole("button", { name: /^salvar$/i });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /entendi e desejo salvar/i }));
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
