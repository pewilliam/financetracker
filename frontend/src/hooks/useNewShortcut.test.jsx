import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import useNewShortcut, { NEW_SHORTCUT_STORAGE_KEY, readNewShortcutEnabled } from "./useNewShortcut.js";

function Fixture({ onNew, blocked = false }) {
  const [enabled, setEnabled] = useState(true);
  useNewShortcut({ enabled, blocked, onNew });
  return <><input aria-label="Descrição" /><div role="combobox" tabIndex={0}>Categoria</div><button onClick={() => setEnabled(false)}>Desativar</button></>;
}

describe("New shortcut", () => {
  it("opens New with an unmodified N and ignores typing and modified keys", () => {
    const onNew = vi.fn();
    render(<Fixture onNew={onNew} />);
    fireEvent.keyDown(document, { key: "n" });
    expect(onNew).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Descrição" }), { key: "n" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "n" });
    fireEvent.keyDown(document, { key: "n", ctrlKey: true });
    fireEvent.keyDown(document, { key: "n", repeat: true });
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("does not activate when blocked, in a dialog or disabled", () => {
    const onNew = vi.fn();
    const { rerender } = render(<Fixture onNew={onNew} blocked />);
    fireEvent.keyDown(document, { key: "n" });
    expect(onNew).not.toHaveBeenCalled();
    rerender(<Fixture onNew={onNew} />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    fireEvent.keyDown(document, { key: "n" });
    expect(onNew).not.toHaveBeenCalled();
    dialog.remove();
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    fireEvent.keyDown(document, { key: "n" });
    expect(onNew).not.toHaveBeenCalled();
  });

  it("reads the saved disable preference", () => {
    localStorage.setItem(NEW_SHORTCUT_STORAGE_KEY, "0");
    expect(readNewShortcutEnabled()).toBe(false);
    localStorage.removeItem(NEW_SHORTCUT_STORAGE_KEY);
    expect(readNewShortcutEnabled()).toBe(true);
  });
});
