export default {
  invoicesBalance(state) {
    return state.accountGetMyWalletsResult
      .filter((account) => account.account_type_id === 1 && !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  savingsBalance(state) {
    return state.accountGetMyWalletsResult
      .filter((account) => account.account_type_id === 2 && !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  debtsBalance(state) {
    return state.accountGetMyWalletsResult
      .filter((account) => account.account_type_id === 3 && !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  activeBalance(state) {
    return state.accountGetMyWalletsResult
      .filter((account) => [1, 2, 3].includes(account.account_type_id) && !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  archiveBalance(state) {
    return state.accountGetMyWalletsResult
      .filter((account) => [1, 2, 3].includes(account.account_type_id) && account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  income(state) {
    return state.accountGetIncomeResult
      .filter((account) => !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  incomeArchive(state) {
    return state.accountGetIncomeResult
      .filter((account) => account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  expenses(state) {
    return state.accountGetExpensesResult
      .filter((account) => !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  expensesArchive(state) {
    return state.accountGetExpensesResult
      .filter((account) => account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
  notMyWallets(state) {
    return state.accountGetNotMyWalletsResult
      .filter((account) => !account.is_archive)
      .sort((a, b) => a?.name?.localeCompare(b?.name, 'en-uk'))
  },
}
