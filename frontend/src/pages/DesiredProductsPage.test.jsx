import "@testing-library/jest-dom/vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import * as api from "../api/api.js";
import DesiredProductsPage from "./DesiredProductsPage.jsx";

vi.mock("../api/api.js", () => ({
  listDesiredProducts: vi.fn(), getDesiredProduct: vi.fn(), createDesiredProduct: vi.fn(),
  updateDesiredProduct: vi.fn(), deleteDesiredProduct: vi.fn(), createProductOffer: vi.fn(),
  updateProductOffer: vi.fn(), deleteProductOffer: vi.fn(), recordProductPurchase: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const product = { id: 1, name: "Notebook Dell", category: "Tecnologia", priority: "high", status: "planning", target_price: "3200.00", best_price: null, offer_count: 0, offers: [] };

function show(route = "/produtos-desejados") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
  return render(<MemoryRouter initialEntries={[route]}><I18nProvider><Routes>
    <Route path="/produtos-desejados" element={<DesiredProductsPage />} />
    <Route path="/produtos-desejados/:productId" element={<DesiredProductsPage />} />
  </Routes></I18nProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
  window.scrollTo = vi.fn();
  api.listDesiredProducts.mockResolvedValue([product]);
  api.getDesiredProduct.mockResolvedValue(product);
});

it("creates a product with target and navigates to its details", async () => {
  const user = userEvent.setup();
  api.createDesiredProduct.mockResolvedValue(product);
  show();
  await user.click(await screen.findByRole("button", { name: "Novo produto" }));
  const dialog = within(screen.getByRole("dialog", { name: "Novo produto desejado" }));
  await user.type(dialog.getByLabelText("Nome do produto *"), "Notebook Dell");
  await user.type(dialog.getByLabelText("Preço-alvo"), "3200,00");
  await user.click(dialog.getByRole("button", { name: "Criar produto" }));
  await waitFor(() => expect(api.createDesiredProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Notebook Dell", target_price: "3200.00", status: "want" })));
  await screen.findByRole("button", { name: "Todos os produtos" });
  expect(api.getDesiredProduct).toHaveBeenCalledWith("1");
});

it("adds credit offers with automatic installments and manual interest adjustments", async () => {
  const user = userEvent.setup();
  api.createProductOffer.mockResolvedValue(product);
  show("/produtos-desejados/1");
  await screen.findByRole("heading", { name: "Ofertas (0)" });
  await user.click(screen.getAllByRole("button", { name: "Adicionar oferta" })[0]);
  let dialog = within(screen.getByRole("dialog", { name: "Adicionar oferta" }));
  await user.type(dialog.getByLabelText("Loja *"), "Amazon");
  await user.type(dialog.getByLabelText("Preço *"), "3600,00");
  await user.selectOptions(dialog.getByLabelText("Pagamento"), "credit");
  await user.clear(dialog.getByLabelText("Quantidade de parcelas"));
  await user.type(dialog.getByLabelText("Quantidade de parcelas"), "10");
  expect(dialog.getByLabelText("Valor da parcela").value).toContain("360,00");
  await user.click(dialog.getByRole("button", { name: "Adicionar oferta" }));
  await waitFor(() => expect(api.createProductOffer).toHaveBeenCalledWith(1, expect.objectContaining({ price: "3600.00", installment_count: 10, installment_amount: null })));
  await user.click(screen.getAllByRole("button", { name: "Adicionar oferta" })[0]);
  dialog = within(screen.getByRole("dialog", { name: "Adicionar oferta" }));
  await user.type(dialog.getByLabelText("Loja *"), "Kabum");
  await user.type(dialog.getByLabelText("Preço *"), "3600,00");
  await user.selectOptions(dialog.getByLabelText("Pagamento"), "credit");
  await user.clear(dialog.getByLabelText("Quantidade de parcelas"));
  await user.type(dialog.getByLabelText("Quantidade de parcelas"), "10");
  await user.clear(dialog.getByLabelText("Valor da parcela"));
  await user.type(dialog.getByLabelText("Valor da parcela"), "400,00");
  await user.click(dialog.getByRole("button", { name: "Adicionar oferta" }));
  await waitFor(() => expect(api.createProductOffer).toHaveBeenLastCalledWith(1, expect.objectContaining({ installment_amount: "400.00" })));
  expect(api.createDesiredProduct).not.toHaveBeenCalled();
});

it("filters cards by status, category and priority", async () => {
  const user = userEvent.setup();
  api.listDesiredProducts.mockResolvedValue([product, { ...product, id: 2, name: "Tênis", category: "Roupas", priority: "low", status: "abandoned" }]);
  show();
  await screen.findByRole("heading", { name: "Notebook Dell" });
  await user.selectOptions(screen.getByLabelText("Status"), "abandoned");
  expect(screen.queryByRole("heading", { name: "Notebook Dell" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Tênis" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Categoria"), "Tecnologia");
  expect(screen.getByText("Nenhum produto encontrado")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Status"), "all");
  await user.selectOptions(screen.getByLabelText("Prioridade"), "high");
  expect(screen.getByRole("heading", { name: "Notebook Dell" })).toBeInTheDocument();
});

it("retries a failed request and preserves purchase details without active offers", async () => {
  const user = userEvent.setup();
  api.getDesiredProduct.mockRejectedValueOnce(new Error("Sem conexão"));
  api.getDesiredProduct.mockResolvedValue({ ...product, status: "bought", purchase_store: "Amazon", paid_price: "3600.00", purchase_date: "2026-10-06", purchase_payment_method: "credit", purchase_installment_count: 10, purchase_installment_amount: "360.00" });
  show("/produtos-desejados/1");
  await user.click(await screen.findByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Compra registrada");
  expect(screen.getByText(/10x de/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar compra" })).not.toBeInTheDocument();
});
