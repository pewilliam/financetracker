import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import { askFinancialAssistant } from "../api/api.js";
import AssistantPage from "./AssistantPage.jsx";

vi.mock("../api/api.js", () => ({ askFinancialAssistant: vi.fn() }));

describe("financial assistant prototype", () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    askFinancialAssistant.mockReset();
  });

  it("sends the question, shows the result and includes prior turns on follow-up", async () => {
    const user = userEvent.setup();
    askFinancialAssistant
      .mockResolvedValueOnce({ answer: "Gastos de R$ 900 em mercado.", as_of: "2026-10-05" })
      .mockResolvedValueOnce({ answer: "Em relação a setembro, houve aumento.", as_of: "2026-10-05" });
    render(<I18nProvider><AssistantPage /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Quais gastos mais pesaram neste mês?" }));
    expect(await screen.findByText("Gastos de R$ 900 em mercado.")).toBeVisible();
    expect(askFinancialAssistant).toHaveBeenNthCalledWith(1, "Quais gastos mais pesaram neste mês?", [], expect.any(Object));

    await user.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "E no mês anterior?");
    await user.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    await waitFor(() => expect(askFinancialAssistant).toHaveBeenNthCalledWith(2, "E no mês anterior?", [
      { role: "user", content: "Quais gastos mais pesaram neste mês?" },
      { role: "assistant", content: "Gastos de R$ 900 em mercado." },
    ], expect.any(Object)));
    expect(await screen.findByText("Em relação a setembro, houve aumento.")).toBeVisible();
  });

  it("keeps the question to retry when the provider is unavailable", async () => {
    const user = userEvent.setup();
    askFinancialAssistant.mockRejectedValueOnce(new Error("Configure OPENAI_API_KEY no servidor."));
    render(<I18nProvider><AssistantPage /></I18nProvider>);
    await user.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "Por que sobrou menos?");
    await user.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("OPENAI_API_KEY");
    expect(screen.getByRole("textbox", { name: "Sua pergunta" })).toHaveValue("Por que sobrou menos?");
  });
});
