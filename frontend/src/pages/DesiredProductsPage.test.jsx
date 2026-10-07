import "@testing-library/jest-dom/vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import * as api from "../api/api.js";
import DesiredProductsPage from "./DesiredProductsPage.jsx";

vi.mock("../api/api.js", () => ({
  listDesiredProducts: vi.fn(), getDesiredProduct: vi.fn(), createDesiredProduct: vi.fn(),
  updateDesiredProduct: vi.fn(), deleteDesiredProduct: vi.fn(), createProductOffer: vi.fn(),
  updateProductOffer: vi.fn(), deleteProductOffer: vi.fn(), recordProductPurchase: vi.fn(), searchProductOffers: vi.fn(), resolveProductOffer: vi.fn(), analyzeProductPurchase: vi.fn(), createCategory: vi.fn(),
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
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  window.scrollTo = vi.fn();
  window.matchMedia = vi.fn(() => ({ matches: false }));
  api.listDesiredProducts.mockResolvedValue([product]);
  api.getDesiredProduct.mockResolvedValue(product);
  api.analyzeProductPurchase.mockResolvedValue({
    offer_id: 7, store: "Loja", payment_method: "pix", first_payment_date: "2026-10-06",
    first_payment_month: "2026-10", last_payment_month: "2026-10", installment_count: 1,
    total_cost: "100.00", average_installment: "100.00", status: "safe",
    baseline_final_balance: "1000.00", projected_final_balance: "900.00",
    minimum_projected_balance: "900.00", worst_month: "2026-10",
    negative_balance_months: [], negative_free_months: [],
    rows: [{ month: "2026-10", installment_number: 1, installment_count: 1, amount: "100.00",
      registered_income: "1000.00", registered_expenses: "0.00", budget_configured: false,
      planning_income: "1000.00", planned_reserve: "0.00", available_budget: "1000.00", free_before: "1000.00", free_after: "900.00",
      baseline_projected_closing: "1000.00", projected_closing: "900.00", cumulative_impact: "-100.00",
      income_commitment_percent: "10.00", negative_balance: false, negative_free_money: false }],
  });
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
  expect(api.getDesiredProduct).toHaveBeenCalledWith("1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it("adds credit offers with automatic installments and manual interest adjustments", async () => {
  const user = userEvent.setup();
  api.createProductOffer.mockResolvedValue(product);
  show("/produtos-desejados/1");
  await screen.findByRole("heading", { name: "Ofertas (0)" });
  await user.click(screen.getAllByRole("button", { name: "Adicionar oferta" })[0]);
  let dialog = within(screen.getByRole("dialog", { name: "Adicionar oferta" }));
  await user.type(dialog.getByLabelText("Loja *"), "Amazon");
  await user.type(dialog.getByLabelText("Preço *"), "693,00");
  await user.type(dialog.getByLabelText("Frete"), "17,00");
  await select(user, dialog, "Pagamento", "Cartão de crédito");
  await user.clear(dialog.getByLabelText("Quantidade de parcelas"));
  await user.type(dialog.getByLabelText("Quantidade de parcelas"), "9");
  expect(dialog.getByLabelText("Valor da parcela").value).toContain("78,89");
  expect(dialog.getByText(/Calculado com preço \+ frete:/)).toHaveTextContent("R$ 78,89/mês");
  await user.click(dialog.getByRole("button", { name: "Adicionar oferta" }));
  await waitFor(() => expect(api.createProductOffer).toHaveBeenCalledWith(1, expect.objectContaining({ price: "693.00", shipping: "17.00", installment_count: 9, installment_amount: null })));
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

it("searches SerpApi results and lets the user review before creating an offer", async () => {
  const user = userEvent.setup();
  api.searchProductOffers.mockResolvedValue([{
    external_id: "shopping-1", title: "Notebook Dell Inspiron 15", store: "Loja Exemplo",
    price: "3499.90", shipping: "0.00", shipping_label: "Frete grátis",
    url: "https://shop.example/notebook", image_url: "https://shop.example/notebook.jpg",
    rating: 4.8, reviews: 120, installment_count: 10, installment_amount: "349.99",
    resolution_token: "immersive-product-token-123456789", source: "serpapi",
  }]);
  api.resolveProductOffer.mockResolvedValue({ url: "https://shop.example/notebook-direto" });
  api.createProductOffer.mockResolvedValue(product);
  show("/produtos-desejados/1");
  await screen.findByRole("heading", { name: "Ofertas (0)" });

  await user.click(screen.getAllByRole("button", { name: "Buscar ofertas" })[0]);
  let dialog = within(screen.getByRole("dialog", { name: "Buscar ofertas" }));
  expect(dialog.getByLabelText("Produto")).toHaveValue("Notebook Dell");
  await user.click(dialog.getByRole("button", { name: "Buscar" }));

  expect(await dialog.findByRole("heading", { name: "Notebook Dell Inspiron 15" })).toBeInTheDocument();
  expect(dialog.getByText("Loja Exemplo")).toBeInTheDocument();
  expect(api.searchProductOffers).toHaveBeenCalledWith(1, "Notebook Dell", { signal: expect.any(AbortSignal), limit: 10 });
  await user.click(dialog.getByRole("button", { name: "Selecionar oferta" }));

  dialog = within(await screen.findByRole("dialog", { name: "Adicionar oferta" }));
  expect(dialog.getByLabelText("Loja *")).toHaveValue("Loja Exemplo");
  expect(dialog.getByLabelText("Link da oferta")).toHaveValue("https://shop.example/notebook-direto");
  expect(dialog.getByLabelText("Quantidade de parcelas")).toHaveValue(10);
  await user.click(dialog.getByRole("button", { name: "Adicionar oferta" }));

  await waitFor(() => expect(api.createProductOffer).toHaveBeenCalledWith(1, expect.objectContaining({
    store: "Loja Exemplo", url: "https://shop.example/notebook-direto", price: "3499.90", shipping: "0.00",
    payment_method: "credit", installment_count: 10, installment_amount: "349.99", source: "serpapi",
  })));
  expect(api.resolveProductOffer).toHaveBeenCalledWith(1, {
    resolution_token: "immersive-product-token-123456789", store: "Loja Exemplo", price: "3499.90",
  });
  expect(api.updateProductOffer).not.toHaveBeenCalled();
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

it("opens product details from the card's native link using the keyboard", async () => {
  const user = userEvent.setup();
  show();
  const link = await screen.findByRole("link", { name: "Ver produto Notebook Dell" });
  expect(link).toHaveAttribute("href", "/produtos-desejados/1");
  expect(screen.queryByRole("button", {name:"Ver produto"})).not.toBeInTheDocument();
  link.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("heading", {name:"Ofertas (0)"});
  expect(api.getDesiredProduct).toHaveBeenCalledWith("1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it("keeps video controls separate from the card navigation", async () => {
  const user = userEvent.setup();
  const videoProduct = {...product, media_url:"https://media.example/demo.mp4", media_type:"video"};
  api.listDesiredProducts.mockResolvedValue([videoProduct]);
  show();
  await screen.findByRole("link", {name:"Ver produto Notebook Dell"});
  const video = document.querySelector("video");
  Object.defineProperty(video, "paused", {configurable:true, value:false});
  fireEvent.play(video);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  await user.click(screen.getByRole("button", {name:"Pausar vídeo"}));
  expect(pause).toHaveBeenCalled();
  await user.click(screen.getByRole("button", {name:"Ativar som"}));
  expect(video.muted).toBe(false);
  expect(api.getDesiredProduct).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", {name:"Produtos desejados"})).toBeInTheDocument();
});

it("waits for a cold server and retries before showing an error", async () => {
  api.getDesiredProduct.mockRejectedValueOnce(Object.assign(new Error("Servidor iniciando"), { status: 503 }));
  api.getDesiredProduct.mockResolvedValue({ ...product, status: "bought", purchase_store: "Amazon", paid_price: "3600.00", purchase_date: "2026-10-06", purchase_payment_method: "credit", purchase_installment_count: 10, purchase_installment_amount: "360.00" });
  show("/produtos-desejados/1");
  expect(await screen.findByRole("heading", { name: "Carregando produtos..." })).toBeInTheDocument();
  expect(screen.queryByText(/servidor está iniciando/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/tentativa \d/i)).not.toBeInTheDocument();
  await screen.findByText("Compra registrada", {}, { timeout: 3000 });
  expect(api.getDesiredProduct).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
  expect(screen.getByText(/10x de/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar compra" })).not.toBeInTheDocument();
});

it("shows expired offers without using them to reach the target price", async () => {
  const user = userEvent.setup();
  const expiredOffer = { id: 7, store: "Adidas", price: "339.00", total_cost: "339.00", payment_method: "credit", installment_count: 3, installment_amount: "113.00", recorded_at: "2025-11-20", price_history: [], is_expired: true };
  api.getDesiredProduct.mockResolvedValue({ ...product, target_price: "400.00", best_offer_id: null, best_price: null, highest_price: null, savings: null, offer_count: 1, offers: [expiredOffer] });
  show("/produtos-desejados/1");
  await screen.findByRole("heading", { name: "Ofertas (1)" });
  expect(screen.getByText("Nenhuma oferta atual")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Ver ofertas (1)" }));
  const expiredToggle = screen.getByRole("button", { name: /Ofertas vencidas \(1\)/ });
  expect(expiredToggle).toHaveAttribute("aria-expanded", "false");
  expect(document.querySelector("#desired-expired-offers-panel")).toHaveAttribute("hidden");
  await user.click(expiredToggle);
  expect(expiredToggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("PREÇO VENCIDO")).toBeInTheDocument();
  expect(screen.queryByText("Seu preço-alvo foi atingido")).not.toBeInTheDocument();
});

it("projects the selected offer across its installment months without recording a purchase", async () => {
  const user = userEvent.setup();
  const offer = { id: 7, store: "Loja Parcelada", price: "600.00", total_cost: "600.00", payment_method: "credit", installment_count: 3, installment_amount: "200.00", recorded_at: "2026-10-06", price_history: [], is_expired: false };
  const installmentProduct = { ...product, planned_purchase_date: "2026-11-05", best_offer_id: 7, best_price: "600.00", highest_price: "600.00", offer_count: 1, offers: [offer] };
  api.getDesiredProduct.mockResolvedValue(installmentProduct);
  api.updateDesiredProduct.mockImplementation(async (_id, payload) => ({ ...installmentProduct, ...payload }));
  api.analyzeProductPurchase.mockResolvedValue({
    offer_id: 7, store: "Loja Parcelada", payment_method: "credit", first_payment_date: "2026-11-05",
    first_payment_month: "2026-11", last_payment_month: "2027-01", installment_count: 3,
    total_cost: "600.00", average_installment: "200.00", status: "attention",
    baseline_final_balance: "1000.00", projected_final_balance: "400.00",
    minimum_projected_balance: "400.00", worst_month: "2027-01",
    negative_balance_months: [], negative_free_months: ["2026-11"],
    rows: ["2026-11", "2026-12", "2027-01"].map((month, index) => ({
      month, installment_number: index + 1, installment_count: 3, amount: "200.00",
      registered_income: "1000.00", registered_expenses: "700.00", budget_configured: true,
      planning_income: "1200.00", planned_reserve: "200.00", available_budget: "1000.00",
      free_before: ["100.00", "300.00", "500.00"][index], free_after: ["-100.00", "100.00", "300.00"][index],
      baseline_projected_closing: "1000.00", projected_closing: String(800 - index * 200) + ".00",
      cumulative_impact: String(-(index + 1) * 200) + ".00", income_commitment_percent: "20.00",
      negative_balance: false, negative_free_money: index === 0,
    })),
  });

  show("/produtos-desejados/1");

  expect(await screen.findByRole("heading", { name: "Impacto desta compra" })).toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: "Ver impacto desta compra" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(api.analyzeProductPurchase).not.toHaveBeenCalled();
  await user.click(toggle);
  expect(screen.getByRole("button", { name: "Ocultar impacto desta compra" })).toHaveAttribute("aria-expanded", "true");
  await waitFor(() => expect(api.analyzeProductPurchase).toHaveBeenCalledWith(1, {
    offer_id: 7, first_payment_date: "2026-11-05",
  }, { signal: expect.any(AbortSignal) }));
  expect(screen.getByRole("button", { name: "Ajuda sobre as escolhas salvas" })).toHaveAttribute("aria-describedby", "desired-financial-save-help-text");
  expect(screen.getByRole("tooltip")).toHaveTextContent("A oferta e o mês serão lembrados neste produto.");
  await user.click(screen.getByRole("button", { name: "Salvar escolhas" }));
  await waitFor(() => expect(api.updateDesiredProduct).toHaveBeenCalledWith(1, {
    analysis_offer_id: 7, analysis_first_payment_date: "2026-11-05",
  }));
  expect(screen.getByRole("button", { name: "Escolhas salvas" })).toBeDisabled();
  expect(screen.getByText("Atenção ao caixa mensal")).toBeInTheDocument();
  expect(screen.getAllByText("3× de R$ 200,00")).toHaveLength(1);
  expect(screen.queryByText("Parcela do mês")).not.toBeInTheDocument();

  const monthCards = screen.getAllByRole("button", { name: /Ver detalhes de/ });
  expect(monthCards).toHaveLength(3);
  expect(monthCards[0]).toHaveAttribute("aria-expanded", "false");
  expect(monthCards[0]).toHaveTextContent("Nov/26 · 1/3");
  expect(monthCards[0]).toHaveTextContent("Após a compra-R$ 100,00");
  expect(monthCards[0]).toHaveTextContent("Antes: R$ 100,00 · 20.00% da renda");
  expect(monthCards[0]).toHaveClass("status-negative");
  expect(monthCards[1]).toHaveClass("status-tight");
  expect(monthCards[2]).toHaveClass("status-comfortable");

  const firstDetails = document.querySelector("#desired-financial-month-2026-11");
  expect(firstDetails).toHaveAttribute("hidden");
  await user.click(monthCards[0]);
  expect(monthCards[0]).toHaveAttribute("aria-expanded", "true");
  expect(firstDetails).not.toHaveAttribute("hidden");
  expect(firstDetails).toHaveTextContent("Saldo livreR$ 100,00 -R$ 100,00");
  expect(firstDetails).toHaveTextContent("Saldo projetadoR$ 1.000,00 R$ 800,00");
  expect(firstDetails).toHaveTextContent("Impacto acumulado- R$ 200,00");
  expect(firstDetails).toHaveTextContent("RendaR$ 1.200,00");
  expect(firstDetails).toHaveTextContent("ReservaR$ 200,00");

  monthCards[1].focus();
  await user.keyboard("{Enter}");
  expect(monthCards[1]).toHaveAttribute("aria-expanded", "true");
  await user.keyboard(" ");
  expect(monthCards[1]).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText(/O saldo livre usa a renda e a reserva do planejamento/)).toBeInTheDocument();
  expect(api.recordProductPurchase).not.toHaveBeenCalled();
});

it("changes how many projection months are shown per page", async () => {
  const user = userEvent.setup();
  const offer = { id: 7, store: "Loja Parcelada", price: "900.00", total_cost: "900.00", payment_method: "credit", installment_count: 9, installment_amount: "100.00", recorded_at: "2026-10-06", price_history: [], is_expired: false };
  const months = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"];
  api.getDesiredProduct.mockResolvedValue({ ...product, best_offer_id: 7, best_price: "900.00", highest_price: "900.00", offer_count: 1, offers: [offer] });
  api.analyzeProductPurchase.mockResolvedValue({
    offer_id: 7, store: "Loja Parcelada", payment_method: "credit", first_payment_date: "2026-10-06",
    first_payment_month: "2026-10", last_payment_month: "2027-06", installment_count: 9,
    total_cost: "900.00", average_installment: "100.00", status: "safe",
    baseline_final_balance: "1000.00", projected_final_balance: "100.00",
    minimum_projected_balance: "100.00", worst_month: "2027-06", negative_balance_months: [], negative_free_months: [],
    rows: months.map((month, index) => ({
      month, installment_number: index + 1, installment_count: 9, amount: "100.00",
      registered_income: "1000.00", registered_expenses: "100.00", budget_configured: true,
      planning_income: "1000.00", planned_reserve: "100.00", available_budget: "900.00", free_before: "800.00", free_after: "700.00",
      baseline_projected_closing: "1000.00", projected_closing: String(900 - index * 100) + ".00",
      cumulative_impact: String(-(index + 1) * 100) + ".00", income_commitment_percent: "10.00",
      negative_balance: false, negative_free_money: false,
    })),
  });

  show("/produtos-desejados/1");
  await user.click(await screen.findByRole("button", { name: "Ver impacto desta compra" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: /Ver detalhes de/ })).toHaveLength(5));
  expect(screen.getByRole("button", { name: "Limite da projeção" })).toHaveTextContent("5");
  expect(screen.getByText("1–5")).toBeInTheDocument();

  await select(user, screen, "Limite da projeção", "10");
  expect(screen.getAllByRole("button", { name: /Ver detalhes de/ })).toHaveLength(9);
  expect(screen.getByText("1–9")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Próxima página" })).not.toBeInTheDocument();

  await select(user, screen, "Limite da projeção", "15");
  expect(screen.getAllByRole("button", { name: /Ver detalhes de/ })).toHaveLength(9);
  await select(user, screen, "Limite da projeção", "Todos");
  expect(screen.getAllByRole("button", { name: /Ver detalhes de/ })).toHaveLength(9);
  await select(user, screen, "Limite da projeção", "5");
  await user.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(screen.getAllByRole("button", { name: /Ver detalhes de/ })).toHaveLength(4);
  expect(screen.getByText("6–9")).toBeInTheDocument();
});

it("expands and collapses the offers section as an accordion", async () => {
  const user = userEvent.setup();
  const offers = [
    { id: 7, store: "Amazon", price: "3499.00", total_cost: "3499.00", payment_method: "pix", recorded_at: "2026-10-06", price_history: [], is_expired: false },
    { id: 8, store: "Kabum", price: "3599.00", total_cost: "3599.00", payment_method: "pix", recorded_at: "2026-10-06", price_history: [], is_expired: false },
  ];
  api.getDesiredProduct.mockResolvedValue({ ...product, best_offer_id: 7, best_price: "3499.00", highest_price: "3599.00", savings: "100.00", offer_count: 2, offers });
  show("/produtos-desejados/1");

  const toggle = await screen.findByRole("button", { name: "Ver ofertas (2)" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(document.querySelector("#desired-offers-panel")).toHaveAttribute("hidden");
  await user.click(toggle);
  expect(screen.getByRole("button", { name: "Ocultar ofertas (2)" })).toHaveAttribute("aria-expanded", "true");
  expect(document.querySelector("#desired-offers-panel")).not.toHaveAttribute("hidden");
  expect(screen.getByRole("heading", { name: "Amazon" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Kabum" })).toBeInTheDocument();
});

it("shows the consolidated store price history on the current offer", async () => {
  const user = userEvent.setup();
  const history = [
    { id: 11, price: "339.00", total_cost: "339.00", recorded_at: "2025-11-20" },
    { id: 12, price: "599.90", total_cost: "599.90", recorded_at: "2026-10-06" },
  ];
  const offer = { id: 8, store: "Adidas", price: "599.90", total_cost: "599.90", payment_method: "pix", recorded_at: "2026-10-06", price_history: [history[1]], store_price_history: history, is_expired: false };
  api.getDesiredProduct.mockResolvedValue({ ...product, best_offer_id: 8, best_price: "599.90", highest_price: "599.90", offer_count: 1, offers: [offer] });
  show("/produtos-desejados/1");

  await user.click(await screen.findByRole("button", { name: "Ver ofertas (1)" }));
  const summary = screen.getByText("Histórico de preços da loja (2)");
  await user.click(summary);
  expect(screen.getByText("20/11/2025")).toBeInTheDocument();
  expect(screen.getByText("06/10/2026")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Evolução do menor preço" })).toBeInTheDocument();
  expect(screen.getByText("2 datas registradas")).toBeInTheDocument();
  expect(screen.getByText(/Menor histórico/)).toHaveTextContent("R$ 339,00");
});

it("paginates current and expired offers independently with ten cards per page", async () => {
  const user = userEvent.setup();
  const current = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, store: `Atual ${index + 1}`, price: `${100 + index}.00`, total_cost: `${100 + index}.00`, payment_method: "pix", recorded_at: "2026-10-06", price_history: [], is_expired: false }));
  const expired = Array.from({ length: 11 }, (_, index) => ({ id: index + 20, store: `Vencida ${index + 1}`, price: `${200 + index}.00`, total_cost: `${200 + index}.00`, payment_method: "pix", recorded_at: `2025-11-${String(index + 1).padStart(2, "0")}`, price_history: [], is_expired: true }));
  api.getDesiredProduct.mockResolvedValue({ ...product, best_offer_id: 1, best_price: "100.00", highest_price: "111.00", offer_count: 23, offers: [...current, ...expired] });
  show("/produtos-desejados/1");

  await user.click(await screen.findByRole("button", { name: "Ver ofertas (23)" }));
  const currentSection = screen.getByRole("region", { name: "Ofertas atuais" });
  expect(currentSection.querySelectorAll(".desired-offer")).toHaveLength(10);
  const currentPagination = within(currentSection).getByRole("navigation", { name: "Paginação das ofertas atuais" });
  expect(within(currentPagination).getByText("1–10")).toBeInTheDocument();
  await user.click(within(currentPagination).getByRole("button", { name: "Próxima página" }));
  expect(currentSection.querySelectorAll(".desired-offer")).toHaveLength(2);
  expect(within(currentPagination).getByText("11–12")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Ofertas vencidas \(11\)/ }));
  const expiredPanel = document.querySelector("#desired-expired-offers-panel");
  expect(expiredPanel.querySelectorAll(".desired-offer")).toHaveLength(10);
  const expiredPagination = within(expiredPanel).getByRole("navigation", { name: "Paginação das ofertas vencidas" });
  await user.click(within(expiredPagination).getByRole("button", { name: "Próxima página" }));
  expect(expiredPanel.querySelectorAll(".desired-offer")).toHaveLength(1);
});

it("preserves offer links and validates the custom date when editing", async () => {
  const user = userEvent.setup();
  const offer = { id: 7, store: "Amazon", url: "https://example.com/notebook", price: "3499.00", total_cost: "3499.00", payment_method: "pix", recorded_at: "2026-10-06", price_history: [] };
  const withOffer = { ...product, best_offer_id: 7, best_price: "3499.00", offer_count: 1, offers: [offer] };
  api.getDesiredProduct.mockResolvedValue(withOffer);
  api.updateProductOffer.mockResolvedValue(withOffer);
  show("/produtos-desejados/1");
  await user.click(await screen.findByRole("button", { name: "Ver ofertas (1)" }));
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

it("uses the compact confirmation layout for product deletion", async () => {
  const user = userEvent.setup();
  show("/produtos-desejados/1");
  await screen.findByRole("heading", { name: "Ofertas (0)" });
  await user.click(screen.getByRole("button", { name: "Excluir", exact: true }));

  const dialog = screen.getByRole("alertdialog", { name: "Excluir produto?" });
  expect(dialog).toHaveClass("confirm-modal");
  expect(dialog.querySelector(".confirm-modal-body")).toBeInTheDocument();
  expect(dialog.querySelector("fieldset")).not.toHaveClass("form-stack");
  expect(within(dialog).getByRole("button", { name: "Excluir" })).toHaveClass("danger-action");
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


it.each([["image", "Imagem ou GIF", "https://media.example/photo.png"], ["image", "Imagem ou GIF", "https://media.example/photo.gif"], ["video", "Vídeo", "https://media.example/demo.mp4"]])("saves direct %s media URLs without metadata import", async (type, label, url) => {
  const user = userEvent.setup();
  api.createDesiredProduct.mockResolvedValue(product);
  show();
  await user.click(await screen.findByRole("button", { name: "Novo produto" }));
  const node = screen.getByRole("dialog");
  const dialog = within(node);
  const name = dialog.getByLabelText("Nome do produto *");
  await user.type(name, "Notebook Dell");
  await user.click(dialog.getByText("Nome do produto *", {selector:"span"}));
  expect(name).not.toHaveFocus();
  expect(node.querySelector("label")).toBeNull();
  expect(dialog.queryByRole("button", {name:"Buscar dados do link"})).not.toBeInTheDocument();
  await user.type(dialog.getByLabelText("URL da mídia"), url);
  if (type === "video") {
    await waitFor(() => expect(node.querySelector("video")).toHaveAttribute("src", url));
    const video = node.querySelector("video");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video.muted).toBe(true);
  } else await waitFor(() => expect(dialog.getByRole("img")).toHaveAttribute("src", url));
  expect(dialog.queryByRole("button", {name:"Adicionar mídia por"})).not.toBeInTheDocument();
  expect(dialog.queryByRole("button", {name:"Tipo de mídia"})).not.toBeInTheDocument();
  expect(dialog.getByRole("button", {name:"Enviar imagem"})).toBeInTheDocument();
  await user.click(dialog.getByRole("button", {name:"Criar produto"}));
  await waitFor(() => expect(api.createDesiredProduct).toHaveBeenCalledWith(expect.objectContaining({media_url:url, media_type:type, image_data:null})));
});

it("keeps and removes saved URL media while editing", async () => {
  const user = userEvent.setup();
  const saved = {...product, media_url:"https://media.example/photo.gif", media_type:"image"};
  api.getDesiredProduct.mockResolvedValue(saved);
  api.updateDesiredProduct.mockResolvedValue(product);
  show("/produtos-desejados/1");
  expect(await screen.findByRole("img", {name:product.name})).toHaveAttribute("src", saved.media_url);
  await user.click(screen.getByRole("button", {name:"Editar", exact:true}));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByLabelText("URL da mídia")).toHaveValue(saved.media_url);
  await user.click(dialog.getByRole("button", {name:"Remover mídia"}));
  await user.click(dialog.getByRole("button", {name:"Salvar alterações"}));
  await waitFor(() => expect(api.updateDesiredProduct).toHaveBeenCalledWith(1, expect.objectContaining({media_url:null, media_type:"image", image_data:null})));
});


it("saves and reapplies framing across details and the editor, and resets it", async () => {
  const user = userEvent.setup();
  const frame = { fit: "cover", x: 25, y: 80, zoom: 1.5 };
  const saved = { ...product, media_url: "https://media.example/demo.mp4", media_type: "video", media_frame: frame };
  api.getDesiredProduct.mockResolvedValue(saved);
  api.updateDesiredProduct.mockResolvedValue(saved);
  show("/produtos-desejados/1");
  await screen.findByRole("heading", {name: "Ofertas (0)"});
  expect(document.querySelector("video")).toHaveStyle({ objectFit: "cover", objectPosition: "25% 80%", transform: "scale(1.5)" });
  await user.click(screen.getByRole("button", {name:"Editar", exact:true}));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("slider", {name:"Zoom da mídia"})).toHaveValue("1.5");
  fireEvent.change(dialog.getByRole("slider", {name:"Posição horizontal"}), {target:{value:"70"}});
  await user.click(dialog.getByRole("button", {name:"Salvar alterações"}));
  await waitFor(() => expect(api.updateDesiredProduct).toHaveBeenCalledWith(1, expect.objectContaining({media_frame:{...frame, x:70}})));
  await user.click(screen.getByRole("button", {name:"Editar", exact:true}));
  await user.click(screen.getByRole("button", {name:"Restaurar enquadramento"}));
  await user.click(screen.getByRole("button", {name:"Salvar alterações"}));
  await waitFor(() => expect(api.updateDesiredProduct).toHaveBeenLastCalledWith(1, expect.objectContaining({media_frame:{fit:"contain", x:50, y:50, zoom:1}})));
});

it("detects an extensionless video by loading without asking for the type", async () => {
  const user = userEvent.setup();
  const url = "https://media.example/asset?id=123";
  api.createDesiredProduct.mockResolvedValue(product);
  show();
  await user.click(await screen.findByRole("button", {name:"Novo produto"}));
  const node = screen.getByRole("dialog");
  const dialog = within(node);
  await user.type(dialog.getByLabelText("Nome do produto *"), "Vídeo sem extensão");
  await user.type(dialog.getByLabelText("URL da mídia"), url);
  await waitFor(() => expect(dialog.getByRole("img")).toHaveAttribute("src", url));
  fireEvent.error(dialog.getByRole("img"));
  const video = node.querySelector("video");
  expect(video).toHaveAttribute("src", url);
  fireEvent.loadedData(video);
  await user.click(dialog.getByRole("button", {name:"Criar produto"}));
  await waitFor(() => expect(api.createDesiredProduct).toHaveBeenCalledWith(expect.objectContaining({media_url:url, media_type:"video"})));
});
