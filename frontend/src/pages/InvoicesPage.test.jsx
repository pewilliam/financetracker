import { groupInvoicesByMonth, invoiceMatchesFilters } from "./InvoicesPage.jsx";

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

describe("invoiceMatchesFilters", () => {
  const baseFilters = { search: "", status: "all", cardIds: [] };
  const invoices = [
    { id: 1, name: "Nubank", credit_card_id: 10, due_date: "2027-01-08", paid: false },
    { id: 2, name: "Inter", credit_card_id: 20, due_date: "2027-01-12", paid: false },
    { id: 3, name: "Itaú", credit_card_id: 30, due_date: "2027-01-18", paid: false },
  ];

  it("accepts invoices from every selected card", () => {
    const filters = { ...baseFilters, cardIds: ["10", "30"] };

    expect(invoices.filter((invoice) => invoiceMatchesFilters(invoice, filters)).map((invoice) => invoice.id)).toEqual([1, 3]);
  });

  it("shows every card when the selection is empty", () => {
    expect(invoices.filter((invoice) => invoiceMatchesFilters(invoice, baseFilters))).toEqual(invoices);
  });
});
