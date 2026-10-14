import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import useTopShortcut, { TOP_SHORTCUT_STORAGE_KEY, readTopShortcutEnabled } from "./useTopShortcut.js";

function Fixture({ onTop, blocked = false, enabled = true }) {
  useTopShortcut({ onTop, blocked, enabled });
  return <><input aria-label="Pesquisar" /><div role="combobox" tabIndex={0}>Categoria</div></>;
}

describe("scroll to top keyboard shortcut", () => {
  it("handles unmodified T but not editing or browser shortcuts", () => {
    const onTop = vi.fn();
    render(<Fixture onTop={onTop} />);
    fireEvent.keyDown(document, { key: "t" });
    expect(onTop).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Pesquisar" }), { key: "t" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "t" });
    fireEvent.keyDown(document, { key: "t", ctrlKey: true });
    fireEvent.keyDown(document, { key: "t", shiftKey: true });
    fireEvent.keyDown(document, { key: "t", repeat: true });
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it("respects a modal, blocked state, and the disabled preference", () => {
    const onTop = vi.fn();
    const { rerender } = render(<Fixture onTop={onTop} blocked />);
    fireEvent.keyDown(document, { key: "t" });
    expect(onTop).not.toHaveBeenCalled();
    rerender(<Fixture onTop={onTop} />);
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    fireEvent.keyDown(document, { key: "t" });
    expect(onTop).not.toHaveBeenCalled();
    modal.remove();
    rerender(<Fixture onTop={onTop} enabled={false} />);
    fireEvent.keyDown(document, { key: "t" });
    expect(onTop).not.toHaveBeenCalled();
  });

  it("persists disabled state using the existing shortcut convention", () => {
    localStorage.setItem(TOP_SHORTCUT_STORAGE_KEY, "0");
    expect(readTopShortcutEnabled()).toBe(false);
    localStorage.removeItem(TOP_SHORTCUT_STORAGE_KEY);
    expect(readTopShortcutEnabled()).toBe(true);
  });
});
