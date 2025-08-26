  const operationTypeId = (fromAccountId, toAccountId) => {
    const isFromAccounts = [1, 2, 3].includes(fromAccountId)
    const isFromIncome = [4].includes(fromAccountId)
    const isFromExpenses = [5].includes(fromAccountId)

    const isToAccounts = [1, 2, 3].includes(toAccountId)
    const isToIncome = [4].includes(toAccountId)
    const isToExpenses = [5].includes(toAccountId)

    if (isFromAccounts && isToAccounts) return 3 // Переказ
    if (isFromAccounts && isToExpenses) return 2 // Витрата
    if (isFromIncome && isToAccounts) return 1 // Дохід
    throw new Error('Невідома операція')
  }

  export default operationTypeId