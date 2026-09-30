import { moveTransactionInMonth } from "./helpers.js";

describe("moveTransactionInMonth", () => {
  const transaction = {
    id: 7,
    type: "expense",
    amount: 25,
    description: "Mercado",
    date: "2026-09-02",
    is_future: false,
  };
  const month = {
    year: 2026,
    month: 9,
    days: [
      { date: "2026-09-01", transactions: [], income: 0, expenses: 0, balance: 100, projected_balance: 100 },
      { date: "2026-09-02", transactions: [transaction], income: 0, expenses: 25, balance: 75, projected_balance: 75 },
      { date: "2026-09-03", transactions: [], income: 0, expenses: 0, balance: 75, projected_balance: 75 },
      { date: "2026-09-04", transactions: [], income: 0, expenses: 0, balance: 75, projected_balance: 75 },
    ],
  };

  it("moves the item immediately and recalculates affected daily balances", () => {
    const moved = moveTransactionInMonth(month, transaction, "2026-09-04");

    expect(moved.days[1].transactions).toHaveLength(0);
    expect(moved.days[1].expenses).toBe(0);
    expect(moved.days[1].balance).toBe(100);
    expect(moved.days[2].balance).toBe(100);
    expect(moved.days[3].transactions[0]).toMatchObject({ id: 7, date: "2026-09-04" });
    expect(moved.days[3].expenses).toBe(25);
    expect(moved.days[3].balance).toBe(75);
  });

  it("can roll an optimistic move back", () => {
    const moved = moveTransactionInMonth(month, transaction, "2026-09-04");
    const rolledBack = moveTransactionInMonth(moved, { ...transaction, date: "2026-09-04" }, "2026-09-02");

    expect(rolledBack.days).toEqual(month.days);
  });
});
