import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import { listCardSubscriptions } from "../api/api.js";
import SubscriptionDetailsModal from "./SubscriptionDetailsModal.jsx";

vi.mock("../api/api.js", () => ({
  listCardSubscriptions: vi.fn(),
}));

const subscription = {
  id: 7,
  description: "iCloud",
  amount: "5.90",
  active: true,
  card_name: "Nubank",
  card_color: "#8B5CF6",
  billing_period: "monthly",
  term_kind: "indefinite",
  charge_day: 22,
  start_date: "2026-10-22",
  categories: [{ id: 3, name: "Assinaturas", color: "#3B82F6" }],
};

describe("SubscriptionDetailsModal", () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    window.scrollTo = vi.fn();
    listCardSubscriptions.mockReset();
  });

  it("renders subscription details using the current detail-modal hierarchy", async () => {
    listCardSubscriptions.mockResolvedValue([subscription]);

    render(
      <I18nProvider>
        <SubscriptionDetailsModal subscriptionId={7} chargeDate="2026-10-22" onClose={() => {}} />
      </I18nProvider>,
    );

    expect(await screen.findByRole("heading", { name: "iCloud" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resumo da assinatura" })).toHaveTextContent(/R\$\s*5,90/);
    expect(screen.getByText("Ativa")).toBeTruthy();
    expect(screen.getByText("Nubank")).toBeTruthy();
    expect(screen.getAllByText("Mensal").length).toBeGreaterThan(0);
    expect(screen.getByText("Prazo indeterminado")).toBeTruthy();
    expect(screen.getByText("Assinaturas")).toBeTruthy();
  });

  it("shows a structured error state when the subscription is unavailable", async () => {
    listCardSubscriptions.mockResolvedValue([]);

    render(
      <I18nProvider>
        <SubscriptionDetailsModal subscriptionId={404} onClose={() => {}} />
      </I18nProvider>,
    );

    expect(await screen.findByText("Não foi possível carregar esta assinatura.")).toBeTruthy();
    expect(screen.getByText("Feche esta janela e tente novamente.")).toBeTruthy();
  });
});
