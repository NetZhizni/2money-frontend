export default {
  accountTotal: (state) => state.accounts.reduce((acc, item) => acc + item.balance, 0),
  // Рахунки
  invoices: (state) => state.accounts.filter((a) => a.account_type_id === 1),
  invoicesTotal: (state) => state.invoices.reduce((acc, item) => acc + item.balance, 0),
  // Збереження
  savings: (state) => state.accounts.filter((a) => a.account_type_id === 2),
  savingsTotal: (state) => state.savings.reduce((acc, item) => acc + item.balance, 0),
  // Борги
  debts: (state) => state.accounts.filter((a) => a.account_type_id === 3),
  debtsTotal: (state) => state.debts.reduce((acc, item) => acc + item.balance, 0),

  accountGroups: (state) => [
    { name: 'Рахунки', total: state.invoicesTotal, accounts: state.invoices },
    { name: 'Збереження', total: state.savingsTotal, accounts: state.savings },
    { name: 'Борги', total: state.debtsTotal, accounts: state.debts },
  ],
}
