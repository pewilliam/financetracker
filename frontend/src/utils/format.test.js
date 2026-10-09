import { describe, expect, it } from "vitest";
import { formatMoney } from "./format.js";

describe("formatMoney", () => {
  it("uses a regular space in Brazilian currency values", () => {
    const formatted = formatMoney(250, "pt-BR");

    expect(formatted).toBe("R$ 250,00");
    expect(formatted).not.toMatch(/[\u00a0\u202f]/);
  });
});
