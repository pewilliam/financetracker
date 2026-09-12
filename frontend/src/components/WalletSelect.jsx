import CategorySelect from "./CategorySelect.jsx";

export function walletSelectOptions(wallets = []) {
  return wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    color: wallet.color || "#14A078",
  }));
}

export default function WalletSelect({ wallets = [], ...props }) {
  return (
    <CategorySelect
      categories={walletSelectOptions(wallets)}
      multiple={false}
      clearable={false}
      placeholder="Selecione a carteira"
      searchPlaceholder="Buscar carteira..."
      ariaLabel="Carteiras"
      {...props}
    />
  );
}
