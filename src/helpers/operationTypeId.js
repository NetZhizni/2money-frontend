const accounts = [1, 2, 3]
const income = [4]
const expenses = [5]

const operationTypeId = (fromAccountId, toAccountId) => {
  const isFromAccounts = accounts.includes(fromAccountId)
  const isFromIncome = income.includes(fromAccountId)
  const isFromExpenses = expenses.includes(fromAccountId)

  const isToAccounts = accounts.includes(toAccountId)
  const isToIncome = income.includes(toAccountId)
  const isToExpenses = expenses.includes(toAccountId)

  if (isFromAccounts && isToAccounts) return 3 // Переказ
  if (isFromAccounts && isToExpenses) return 2 // Витрата
  if (isFromIncome && isToAccounts) return 1 // Дохід
  throw new Error('Невідома операція')
}

export default operationTypeId
