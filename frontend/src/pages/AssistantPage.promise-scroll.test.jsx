import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { askFinancialAssistant } from "../api/api.js";
import AssistantPage from "./AssistantPage.jsx";

vi.mock("../api/api.js", () => ({ askFinancialAssistant: vi.fn() }));
vi.mock("../i18n/index.ts", () => ({
  useI18n: () => ({ t: (key) => key, language: "pt-BR" }),
}));

it("sends a question when scrollIntoView returns a promise", async () => {
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve());
  askFinancialAssistant.mockResolvedValue({ answer: "Resposta financeira", as_of: "2026-10-05" });
  try {
    const user = userEvent.setup();
    render(<AssistantPage />);
    await user.type(screen.getByRole("textbox"), "Por que meu saldo caiu?");
    await user.click(screen.getByRole("button", { name: "assistant.send" }));
    expect(await screen.findByText("Resposta financeira")).toBeVisible();
    expect(askFinancialAssistant).toHaveBeenCalledOnce();
  } finally {
    Element.prototype.scrollIntoView = original;
  }
});
