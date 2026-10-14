import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategorySelect from "./CategorySelect.jsx";
import WalletSelect from "./WalletSelect.jsx";

const categories = [{ id: 1, name: "Alimentação", color: "#0a8" }, { id: 2, name: "Lazer", color: "#a80" }];
const wallets = [{ id: 3, name: "Principal", color: "#0a8" }, { id: 4, name: "Reserva", color: "#a80" }];

function FormFixture({ onSave }) {
  const [categoryIds, setCategoryIds] = useState([]);
  const [walletId, setWalletId] = useState("3");
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <CategorySelect categories={categories} values={categoryIds} onChange={setCategoryIds} ariaLabel="Categoria" />
      <WalletSelect wallets={wallets} value={walletId} onChange={setWalletId} ariaLabel="Carteira" />
      <button type="button">Lançamento recorrente?</button>
      <button type="button">Cancelar</button>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe("custom select keyboard and form behavior", () => {
  it("selects with Space, arrows and Enter, then submits with Enter on the trigger", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<FormFixture onSave={onSave} />);
    const category = screen.getByRole("combobox", { name: "Categoria" });
    category.focus();
    await user.keyboard(" ");
    expect(category).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowDown}");
    const options = within(screen.getByRole("listbox", { name: "Categoria" })).getAllByRole("option");
    expect(options[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(category).toHaveFocus();
    expect(category).toHaveAttribute("aria-expanded", "false");
    expect(onSave).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(category).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves natural tab order after closing a category", async () => {
    const user = userEvent.setup();
    render(<FormFixture onSave={vi.fn()} />);
    const category = screen.getByRole("combobox", { name: "Categoria" });
    category.focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Escape}");
    expect(category).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Carteira" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Lançamento recorrente?" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Salvar" })).toHaveFocus();
  });

  it("applies the same closed-trigger Enter submission to WalletSelect", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<FormFixture onSave={onSave} />);
    const wallet = screen.getByRole("combobox", { name: "Carteira" });
    wallet.focus();
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(wallet).toHaveAttribute("aria-expanded", "false");
  });
});
