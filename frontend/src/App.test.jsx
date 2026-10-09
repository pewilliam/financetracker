import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import App from "./App.jsx";

vi.mock("./hooks/useAuth.jsx", () => ({
  useAuth: () => ({ loading: false, authenticated: true }),
}));

vi.mock("./i18n/index.ts", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock("./pages/AuthPage.jsx", () => ({ default: () => <div>Auth</div> }));
vi.mock("./pages/LandingPage.jsx", () => ({ default: () => <div>Landing</div> }));
vi.mock("./components/layout/AppShell.jsx", () => ({
  default: function PersistentShell() {
    const location = useLocation();
    const [marker, setMarker] = useState(0);
    return (
      <div>
        <span data-testid="route">{location.pathname}</span>
        <span data-testid="marker">{marker}</span>
        <button type="button" onClick={() => setMarker(1)}>Marcar shell</button>
        <Link to="/">Início</Link>
        <Link to="/faturas">Faturas</Link>
      </div>
    );
  },
}));

describe("application routing", () => {
  it.each(["/faturas", "/produtos-desejados/42"])("keeps the authenticated shell mounted when entering and leaving the dashboard from %s", async (route) => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Marcar shell" }));
    await user.click(screen.getByRole("link", { name: "Início" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/");
    expect(screen.getByTestId("marker")).toHaveTextContent("1");

    await user.click(screen.getByRole("link", { name: "Faturas" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/faturas");
    expect(screen.getByTestId("marker")).toHaveTextContent("1");
  });
});
