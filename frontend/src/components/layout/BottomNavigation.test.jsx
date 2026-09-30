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
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.at(-2)).toBe("Tema");
    expect(items.at(-1)).toBe("Configurações");
  });

  it("toggles light and dark theme from the More menu", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("finance-theme", "light");
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "light";
    renderNavigation();

    await user.click(screen.getByRole("button", { name: "Mais" }));
    const themeButton = screen.getByRole("menuitem", { name: "Tema" });
    expect(themeButton.querySelector(".lucide-moon")).toBeInTheDocument();

    await user.click(themeButton);
    expect(screen.getByRole("menu", { name: "Outras telas" })).toBeVisible();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("finance-theme")).toBe("dark");
    expect(screen.getByRole("menuitem", { name: "Tema" }).querySelector(".lucide-sun")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Tema" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("finance-theme")).toBe("light");
    expect(screen.getByRole("menuitem", { name: "Tema" }).querySelector(".lucide-moon")).toBeInTheDocument();
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
