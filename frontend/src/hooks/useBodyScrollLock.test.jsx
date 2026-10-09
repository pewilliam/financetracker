import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import useBodyScrollLock from "./useBodyScrollLock.js";

function Subject({ locked }) {
  useBodyScrollLock(locked);
  return <div>Conteúdo</div>;
}

describe("useBodyScrollLock", () => {
  beforeEach(() => {
    document.body.style.cssText = "";
    document.documentElement.style.cssText = "";
  });

  it("locks overflow without moving the page to the top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender, unmount } = render(<Subject locked />);

    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(scrollTo).not.toHaveBeenCalled();

    rerender(<Subject locked={false} />);
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(scrollTo).not.toHaveBeenCalled();

    unmount();
    scrollTo.mockRestore();
  });
});
