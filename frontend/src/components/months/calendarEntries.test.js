import { calendarDays, describeEntry, entriesForDay, moveCalendarEntry } from "./calendarEntries.js";

const invoice = {id: 9, paid: true};
const item = {id: 4, date: "2026-10-01", type: "expense", amount: "25.00", invoice_id: 9};
const planned = {id: 7, due_date: "2026-10-01", remaining_amount: "30.00", status: "pending"};
const days = [
  {date: "2026-10-01", transactions: [item], planned_receivables: [planned], balance: 75, projected_balance: 105},
  {date: "2026-10-02", transactions: [], planned_receivables: [], balance: 75, projected_balance: 105},
  {date: "2026-10-03", transactions: [], planned_receivables: [], balance: 75, projected_balance: 105},
];

it("derives daily variation from consecutive balances including wallet effects", () => {
  const result = calendarDays(days, 2026, 10, 100);
  expect(result[0].variation).toBe(-25);
  expect(result[1].variation).toBe(0);
  expect(result[0].totals).toEqual({income: 0, expense: 25, planned: 30});
  expect(result).toHaveLength(31);
});

it("moves an invoice's linked transaction and adjusts only the balances between dates", () => {
  const entry = entriesForDay(days[0], [invoice])[0];
  const result = moveCalendarEntry(days, entry, "2026-10-01", "2026-10-03");
  expect(result.map(day => day.balance)).toEqual([100, 100, 75]);
  expect(result.map(day => day.projected_balance)).toEqual([130, 130, 105]);
  expect(result[0].transactions).toHaveLength(0);
  expect(result[2].transactions[0].date).toBe("2026-10-03");
  expect(result[2].expenses).toBe(25);
  expect(days[0].transactions).toHaveLength(1);
});

it("moving an expected receivable changes forecasts without changing realized balances", () => {
  const entry = entriesForDay(days[0])[1];
  const result = moveCalendarEntry(days, entry, "2026-10-01", "2026-10-03");
  expect(result.map(day => day.balance)).toEqual([75, 75, 75]);
  expect(result.map(day => day.projected_balance)).toEqual([75, 75, 105]);
  expect(result[2].planned_receivables[0].due_date).toBe("2026-10-03");
  expect(result[0].planned_receivables).toHaveLength(0);
});

it("identifies paid/pending invoices and receivables using their actual status", () => {
  expect(describeEntry(entriesForDay(days[0], [invoice])[0], "pt-BR").status).toBe("paid");
  expect(describeEntry(entriesForDay(days[0], [{...invoice, paid: false}])[0], "pt-BR").status).toBe("pending");
  expect(describeEntry(entriesForDay(days[0])[1], "pt-BR").status).toBe("pending");
});
