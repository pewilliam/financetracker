import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider, LANGUAGE_STORAGE_KEY } from "../../i18n/index.ts";
import BottomNavigation from "./BottomNavigation.jsx";

function renderNavigation({ route = "/", ...props } = {}) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt-BR");
  return render(
    <MemoryRouter initialEntries={[route]}>
      <I18nProvider>
        <BottomNavigation {...props} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("bottom navigation", () => {
  it("highlights the current primary screen", () => {
    renderNavigation({ route: "/faturas" });

    expect(screen.getByRole("navigation", { name: "Navegação rápida" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Faturas" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveClass("active");
    expect(screen.getByRole("link", { name: "Carteiras" })).toHaveAttribute("href", "/carteiras");
  });

  it("opens the secondary screens menu from More", async () => {
    const user = userEvent.setup();
    renderNavigation({ route: "/simulador" });

    const more = screen.getByRole("button", { name: "Mais" });
    expect(more).toHaveClass("active");
    await user.click(more);
    expect(screen.getByRole("menu", { name: "Outras telas" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Simulador" })).toHaveClass("active");
    expect(screen.getByRole("menuitem", { name: "Configurações" })).toHaveAttribute("href", "/configuracoes");
  });

  it("animates both into and out of the dashboard tab", async () => {
    const user = userEvent.setup();
    const { container } = renderNavigation({ route: "/faturas" });

    await user.click(screen.getByRole("link", { name: "Início" }));
    expect(container.querySelector(".bottom-navigation-liquid-body")).toHaveClass("is-moving");

    await user.click(screen.getByRole("link", { name: "Mês" }));
    expect(container.querySelector(".bottom-navigation-liquid-body")).toHaveClass("is-moving");
  });
});
