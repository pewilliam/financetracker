import { describe, expect, it } from "vitest";
import { buildReceivablePeople } from "./ReceivablesPage.jsx";

describe("receivables grouped by person", () => {
  it("keeps registered people without receivables and summarizes open balances", () => {
    const people = [
      { id: 1, name: "Ana" },
      { id: 2, name: "Bruno" }
    ];
    const receivables = [
      {
        id: 10,
        person_id: 1,
        person_name: "Ana",
        description: "Empréstimo",
        total_amount: 100,
        received_amount: 20,
        remaining_amount: 80,
        due_date: "2026-10-01",
        status: "overdue"
      },
      {
        id: 11,
        person_id: 1,
        person_name: "Ana",
        description: "Compra",
        total_amount: 50,
        received_amount: 50,
        remaining_amount: 0,
        due_date: "2026-09-01",
        status: "paid"
      }
    ];

    const result = buildReceivablePeople(people, receivables);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 1,
      name: "Ana",
      open_count: 1,
      overdue_count: 1,
      total_open: 80,
      total_overdue: 80,
      next_due: "2026-10-01"
    });
    expect(result[1]).toMatchObject({
      id: 2,
      name: "Bruno",
      open_count: 0,
      total_open: 0,
      next_due: null
    });
  });
});
