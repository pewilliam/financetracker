import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../i18n/index.ts";
import CategoryModal from "./CategoryModal.jsx";

describe("CategoryModal", () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it("explains and saves behavior options during category creation", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <CategoryModal onSave={onSave} onClose={() => {}} />
      </I18nProvider>,
    );

    expect(screen.getByText(/lançamentos continuam no histórico/i)).toBeVisible();
    expect(screen.getByText(/nada será incluído automaticamente/i)).toBeVisible();

    await user.type(screen.getByPlaceholderText(/Alimentação/i), "Freelance");
    await user.click(screen.getByRole("checkbox", { name: /ignorar em orçamento e gastos/i }));
    await user.click(screen.getByRole("checkbox", { name: /considerar como renda/i }));
    await user.click(screen.getByRole("button", { name: /criar categoria/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Freelance",
      ignore_in_category_analysis: true,
      include_in_income_planning: true,
    })));
  });

  it("explains and saves behavior options while editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <CategoryModal
          category={{ id: 7, name: "Freelance", color: "#14A078", ignore_in_category_analysis: false, include_in_income_planning: false }}
          onSave={onSave}
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/lançamentos continuam no histórico/i)).toBeVisible();
    expect(screen.getByText(/nada será incluído automaticamente/i)).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: /ignorar em orçamento e gastos/i }));
    await user.click(screen.getByRole("checkbox", { name: /considerar como renda/i }));
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Freelance",
      ignore_in_category_analysis: true,
      include_in_income_planning: true,
    })));
  });
});
