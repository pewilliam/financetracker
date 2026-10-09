import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("menu", { name: "Demais funcionalidades" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Simulador" })).toHaveClass("active");
    expect(screen.getByRole("menuitem", { name: "Configurações" })).toHaveAttribute("href", "/configuracoes");
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.at(-2)).toBe("Tema");
    expect(items.at(-1)).toBe("Configurações");
  });

  it("keeps More selected on a desired product details route", async () => {
    const user = userEvent.setup();
    renderNavigation({ route: "/produtos-desejados/42" });

    const more = screen.getByRole("button", { name: "Mais" });
    expect(more).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveClass("active");

    await user.click(more);
    expect(screen.getByRole("menuitem", { name: "Produtos desejados" })).toHaveClass("active");
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
    expect(screen.getByRole("menu", { name: "Demais funcionalidades" })).toBeVisible();
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

  it("drags the liquid selector to a destination without changing normal clicks", () => {
    const { container } = renderNavigation({ route: "/faturas" });
    const surface = container.querySelector(".bottom-navigation-surface");
    const handle = container.querySelector(".bottom-navigation-drag-handle");
    const items = [...container.querySelectorAll(".bottom-navigation-item")];
    surface.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 68, width: 800, height: 68, x: 0, y: 0, toJSON() {} });
    handle.getBoundingClientRect = () => ({ left: 200, right: 300, top: 6, bottom: 62, width: 100, height: 56, x: 200, y: 6, toJSON() {} });
    items.forEach((item, index) => {
      item.getBoundingClientRect = () => ({ left: index * 100, right: (index + 1) * 100, top: 6, bottom: 62, width: 100, height: 56, x: index * 100, y: 6, toJSON() {} });
    });
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 250, clientY: 34 }));
    fireEvent(handle, new MouseEvent("pointermove", { bubbles: true, clientX: 365, clientY: 34 }));

    expect(container.querySelector(".bottom-navigation")).toHaveClass("is-dragging");
    expect(screen.getByRole("link", { name: "Cartões" })).toHaveClass("is-drag-target");

    fireEvent(handle, new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 365, clientY: 34 }));
    expect(screen.getByRole("link", { name: "Cartões" })).toHaveClass("active");
    expect(container.querySelector(".bottom-navigation")).not.toHaveClass("is-dragging");

    fireEvent.click(screen.getByRole("link", { name: "Mês" }));
    expect(screen.getByRole("link", { name: "Mês" })).toHaveClass("active");
  });

  it("keeps the active More control clickable through the selector handle", () => {
    const { container } = renderNavigation({ route: "/simulador" });
    const handle = container.querySelector(".bottom-navigation-drag-handle");
    handle.getBoundingClientRect = () => ({ left: 700, right: 800, top: 6, bottom: 62, width: 100, height: 56, x: 700, y: 6, toJSON() {} });

    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 750, clientY: 34 }));
    fireEvent(handle, new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 750, clientY: 34 }));

    expect(screen.getByRole("menu", { name: "Demais funcionalidades" })).toBeVisible();
  });
});
