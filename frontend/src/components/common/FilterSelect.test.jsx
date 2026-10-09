import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterSelect from "./FilterSelect.jsx";

it("keeps rendering while asynchronously loaded options have no selected value", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(<FilterSelect value="" options={[]} ariaLabel="Oferta analisada" onChange={onChange} />);
  expect(screen.getByRole("button", {name: "Oferta analisada"})).toHaveTextContent("—");
  rerender(<FilterSelect value="" options={[{value: "1", label: "Primeira oferta"}]} ariaLabel="Oferta analisada" onChange={onChange} />);
  await user.click(screen.getByRole("button", {name: "Oferta analisada"}));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", {name: "Primeira oferta"}));
  expect(onChange).toHaveBeenCalledWith("1");
  rerender(<FilterSelect value="1" options={[{value: "1", label: "Primeira oferta"}]} ariaLabel="Oferta analisada" onChange={onChange} />);
  expect(screen.getByRole("button", {name: "Oferta analisada"})).toHaveTextContent("Primeira oferta");
});

it("shows the empty value when the selected option is removed", () => {
  const { rerender } = render(<FilterSelect value="1" options={[{value: "1", label: "Oferta removida", description: "Loja"}]} ariaLabel="Oferta analisada" />);
  expect(screen.getByRole("button", {name: "Oferta analisada"})).toHaveTextContent("Loja");
  rerender(<FilterSelect value="1" options={[]} ariaLabel="Oferta analisada" />);
  expect(screen.getByRole("button", {name: "Oferta analisada"})).toHaveTextContent("—");
});
