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
  updateProductOffer: vi.fn(), deleteProductOffer: vi.fn(), recordProductPurchase: vi.fn(), createCategory: vi.fn(), importProductUrl: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const product = { id: 1, name: "Notebook Dell", category: "Tecnologia", priority: "high", status: "planning", target_price: "3200.00", best_price: null, offer_count: 0, offers: [] };

function show(route = "/produtos-desejados") {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
  return render(<MemoryRouter initialEntries={[route]}><I18nProvider><Routes>
    <Route path="/produtos-desejados" element={<DesiredProductsPage categories={[{ id: 3, name: "Tecnologia", color: "#64748B" }]} onCreateCategory={api.createCategory} />} />
    <Route path="/produtos-desejados/:productId" element={<DesiredProductsPage categories={[{ id: 3, name: "Tecnologia", color: "#64748B" }]} onCreateCategory={api.createCategory} />} />
  </Routes></I18nProvider></MemoryRouter>);
}

async function select(user, scope, name, option) {
  await user.click(scope.getByRole("button", { name, exact: true }));
  await user.click(within(screen.getByRole("listbox", { name, exact: true })).getByRole("option", { name: option, exact: true }));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.scrollTo = vi.fn();
  window.matchMedia = vi.fn(() => ({ matches: false }));
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
  await user.click(dialog.getByRole("combobox", { name: "Categoria" }));
  await user.click(within(screen.getByRole("listbox", { name: "Categoria" })).getByRole("option", { name: "Tecnologia" }));
  await user.type(dialog.getByLabelText("Preço-alvo"), "3200,00");
  await select(user, dialog, "Prioridade", "Alta");
  await select(user, dialog, "Status", "Planejando");
  const plannedDate = dialog.getByRole("textbox", { name: "Previsão de compra" });
  await user.type(plannedDate, "01112026");
  await user.tab();
  await user.click(plannedDate);
  await user.click(document.querySelector(".date-days .selected"));
  expect(plannedDate).toHaveValue("01/11/2026");
  await user.click(dialog.getByRole("button", { name: "Criar produto" }));
  await waitFor(() => expect(api.createDesiredProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Notebook Dell", category_id: 3, target_price: "3200.00", status: "planning", priority: "high", planned_purchase_date: "2026-11-01" })));
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
  await select(user, dialog, "Pagamento", "Cartão de crédito");
  await user.clear(dialog.getByLabelText("Quantidade de parcelas"));
  await user.type(dialog.getByLabelText("Quantidade de parcelas"), "10");
  expect(dialog.getByLabelText("Valor da parcela").value).toContain("360,00");
  await user.click(dialog.getByRole("button", { name: "Adicionar oferta" }));
  await waitFor(() => expect(api.createProductOffer).toHaveBeenCalledWith(1, expect.objectContaining({ price: "3600.00", installment_count: 10, installment_amount: null })));
  await user.click(screen.getAllByRole("button", { name: "Adicionar oferta" })[0]);
  dialog = within(screen.getByRole("dialog", { name: "Adicionar oferta" }));
  await user.type(dialog.getByLabelText("Loja *"), "Kabum");
  await user.type(dialog.getByLabelText("Preço *"), "3600,00");
  await select(user, dialog, "Pagamento", "Cartão de crédito");
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
  await select(user, screen, "Status", "Desisti");
  expect(screen.queryByRole("heading", { name: "Notebook Dell" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Tênis" })).toBeInTheDocument();
  await select(user, screen, "Categoria", "Tecnologia");
  expect(screen.getByText("Nenhum produto encontrado")).toBeInTheDocument();
  await select(user, screen, "Status", "Todos");
  await select(user, screen, "Prioridade", "Alta");
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

it("preserves offer links and validates the custom date when editing", async () => {
  const user = userEvent.setup();
  const offer = { id: 7, store: "Amazon", url: "https://example.com/notebook", price: "3499.00", total_cost: "3499.00", payment_method: "pix", recorded_at: "2026-10-06", price_history: [] };
  const withOffer = { ...product, best_offer_id: 7, best_price: "3499.00", offer_count: 1, offers: [offer] };
  api.getDesiredProduct.mockResolvedValue(withOffer);
  api.updateProductOffer.mockResolvedValue(withOffer);
  show("/produtos-desejados/1");
  const link = await screen.findByRole("link", { name: "Ver na loja" });
  expect(link).toHaveAttribute("href", offer.url);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await user.click(within(link.closest("article")).getByRole("button", { name: "Editar" }));
  const dialogNode = screen.getByRole("dialog", { name: "Editar oferta" });
  const dialog = within(dialogNode);
  expect(dialogNode).toHaveClass("wallet-editor-modal");
  expect(dialog.getByLabelText("Link da oferta")).toHaveValue(offer.url);
  const date = dialog.getByRole("textbox", { name: "Data do preço" });
  await user.click(date);
  await user.keyboard("{Escape}");
  expect(document.querySelector(".date-popover")).not.toBeInTheDocument();
  expect(dialogNode).toBeInTheDocument();
  await user.clear(date);
  await user.tab();
  await user.click(dialog.getByRole("button", { name: "Salvar oferta" }));
  expect(api.updateProductOffer).not.toHaveBeenCalled();
  await user.type(date, "15102026");
  await user.tab();
  await user.click(dialog.getByRole("button", { name: "Salvar oferta" }));
  await waitFor(() => expect(api.updateProductOffer).toHaveBeenCalledWith(1, 7, expect.objectContaining({ url: offer.url, recorded_at: "2026-10-15" })));
});

it("allows clearing an optional planned date", async () => {
  const user = userEvent.setup();
  api.getDesiredProduct.mockResolvedValue({ ...product, planned_purchase_date: "2026-11-01" });
  api.updateDesiredProduct.mockResolvedValue(product);
  show("/produtos-desejados/1");
  await user.click(await screen.findByRole("button", { name: "Editar", exact: true }));
  const dialog = within(screen.getByRole("dialog", { name: "Editar produto" }));
  await user.clear(dialog.getByRole("textbox", { name: "Previsão de compra" }));
  await user.tab();
  await user.click(dialog.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(api.updateDesiredProduct).toHaveBeenCalledWith(1, expect.objectContaining({ planned_purchase_date: null })));
});

it("previews imported product fields before applying and allows correction", async () => {
  const user = userEvent.setup();
  const image = "data:image/png;base64,aW1hZ2U=";
  api.importProductUrl.mockResolvedValue({ url: "https://example.com/notebook", name: "Notebook da loja", ean: "7891234567895", description: "Descrição encontrada", image_data: image, warnings: [] });
  api.createDesiredProduct.mockResolvedValue(product);
  show();
  await user.click(await screen.findByRole("button", { name: "Novo produto" }));
  const dialog = within(screen.getByRole("dialog", { name: "Novo produto desejado" }));
  await user.type(dialog.getByLabelText("Nome do produto *"), "Meu rascunho");
  await user.type(dialog.getByLabelText("Link do produto"), "https://example.com/notebook");
  await user.click(dialog.getByRole("button", { name: "Buscar dados do link" }));
  await dialog.findByRole("region", { name: "Dados encontrados" });
  expect(dialog.getByLabelText("Nome do produto *")).toHaveValue("Meu rascunho");
  expect(api.createDesiredProduct).not.toHaveBeenCalled();
  await user.click(dialog.getByRole("button", { name: "Usar dados encontrados" }));
  expect(dialog.getByLabelText("Nome do produto *")).toHaveValue("Notebook da loja");
  expect(dialog.getByLabelText("EAN/GTIN")).toHaveValue("7891234567895");
  expect(dialog.getByLabelText("Observações")).toHaveValue("Descrição encontrada");
  expect(dialog.getByRole("img", { name: "Prévia do produto" })).toHaveAttribute("src", image);
  await user.clear(dialog.getByLabelText("Nome do produto *"));
  await user.type(dialog.getByLabelText("Nome do produto *"), "Nome corrigido");
  await user.click(dialog.getByRole("button", { name: "Criar produto" }));
  await waitFor(() => expect(api.createDesiredProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Nome corrigido", ean: "7891234567895", source_url: "https://example.com/notebook", image_source: "url" })));
});

it("keeps manual values when URL import fails", async () => {
  const user = userEvent.setup();
  api.importProductUrl.mockRejectedValue(new Error("Loja bloqueou a leitura"));
  show();
  await user.click(await screen.findByRole("button", { name: "Novo produto" }));
  const dialog = within(screen.getByRole("dialog"));
  await user.type(dialog.getByLabelText("Nome do produto *"), "Meu notebook");
  await user.type(dialog.getByLabelText("Link do produto"), "https://example.com/notebook");
  await user.click(dialog.getByRole("button", { name: "Buscar dados do link" }));
  await dialog.findByRole("alert");
  expect(dialog.getByLabelText("Nome do produto *")).toHaveValue("Meu notebook");
  expect(dialog.getByRole("button", { name: "Criar produto" })).toBeEnabled();
});

it("creates a category inside the product editor without submitting the product", async () => {
  const user = userEvent.setup();
  api.createDesiredProduct.mockResolvedValue(product);
  api.createCategory.mockResolvedValue({ id: 8, name: "Nova categoria", color: "#64748B" });
  show();
  await user.click(await screen.findByRole("button", { name: "Novo produto" }));
  const parent = screen.getByRole("dialog", { name: "Novo produto desejado" });
  await user.click(within(parent).getByRole("combobox", { name: "Categoria" }));
  await user.click(within(screen.getByRole("listbox", { name: "Categoria" })).getByRole("option", { name: "Tecnologia" }));
  await user.click(within(parent).getByRole("combobox", { name: "Categoria" }));
  await user.click(screen.getByRole("button", { name: "Nova categoria" }));
  const category = within(screen.getByRole("dialog", { name: "Nova categoria" }));
  await user.type(category.getByRole("textbox"), "Nova categoria");
  await user.click(category.getByRole("button", { name: "Criar categoria" }));
  await waitFor(() => expect(api.createCategory).toHaveBeenCalled());
  expect(parent).toBeInTheDocument();
  expect(api.createDesiredProduct).not.toHaveBeenCalled();
  await user.type(within(parent).getByLabelText("Nome do produto *"), "Produto com categoria nova");
  await user.click(within(parent).getByRole("button", { name: "Criar produto" }));
  await waitFor(() => expect(api.createDesiredProduct).toHaveBeenCalledWith(expect.objectContaining({ category_id: 8 })));

});

it("preserves a manually entered BRL price when the imported offer uses another currency", async () => {
  const user = userEvent.setup();
  api.createProductOffer.mockResolvedValue(product);
  api.importProductUrl.mockResolvedValue({url: "https://example.com/offer", store: "Loja estrangeira", price: "200.00", currency: "USD", warnings: []});
  show("/produtos-desejados/1");
  await screen.findByRole("heading", {name: "Ofertas (0)"});
  await user.click(screen.getAllByRole("button", {name: "Adicionar oferta"})[0]);
  const dialog = within(screen.getByRole("dialog"));
  await user.type(dialog.getByLabelText("Loja *"), "Loja manual");
  await user.type(dialog.getByLabelText("Preço *"), "1000,00");
  await user.type(dialog.getByLabelText("Link da oferta"), "https://example.com/offer");
  await user.click(dialog.getByRole("button", {name: "Buscar dados do link"}));
  await dialog.findByText("Confira a moeda e informe manualmente o preço em reais.");
  await user.click(dialog.getByRole("button", {name: "Usar dados encontrados"}));
  expect(dialog.getByLabelText("Loja *")).toHaveValue("Loja estrangeira");
  await user.click(dialog.getByRole("button", {name: "Adicionar oferta", exact:true}));
  await waitFor(() => expect(api.createProductOffer).toHaveBeenCalledWith(1, expect.objectContaining({price: "1000.00"})));
});
