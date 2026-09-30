import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "react-hot-toast";
import { showDateMoveToast } from "./DateMoveToast.jsx";

describe("date move toast", () => {
  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    });
  });

  it("runs undo and dismisses the notice", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<Toaster position="top-right" />);

    act(() => {
      showDateMoveToast({
        message: "Data atualizada",
        undoLabel: "Desfazer",
        onUndo,
      });
    });

    expect(await screen.findByText("Data atualizada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Data atualizada")).toBeNull());
  });
});
