import { groupInvoicesByMonth } from "./InvoicesPage.jsx";

describe("groupInvoicesByMonth", () => {
  it("groups the remaining invoices by due month and orders months and due dates", () => {
    const groups = groupInvoicesByMonth([
      { id: 3, due_date: "2027-02-18" },
      { id: 2, due_date: "2027-01-22" },
      { id: 1, due_date: "2027-01-08" },
    ], "pt-BR");

    expect(groups.map((group) => group.id)).toEqual(["2027-01", "2027-02"]);
    expect(groups[0].label).toMatch(/^Janeiro.*2027$/i);
    expect(groups[0].items.map((invoice) => invoice.id)).toEqual([1, 2]);
    expect(groups[1].items.map((invoice) => invoice.id)).toEqual([3]);
  });
});
