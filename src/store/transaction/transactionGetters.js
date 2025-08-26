import dateToLocal from '@/helpers/dateToLocal'

export default {
  transactionGetMyResultSorted(state) {
    return state.transactionGetMyResult.sort((a, b) => {
      const bDate = new Date(b?.date).getTime()
      const aDate = new Date(a?.date).getTime()
      return bDate - aDate
    })
  },

  // ДОХІД
  transactionIncome(state) {
    return state.transactionGetMyResultSorted.filter((el) => el.operation_type_id === 1)
  },
  transactionIncomeGrouped(state) {
    const groupedData = {}
    state.transactionIncome?.forEach((item) => {
      // Створюємо ключ у вигляді "повна_назва_місяця рік"
      const key = dateToLocal(item.date, { dateStyle: 'long' })
      // Додаємо об'єкт до відповідного ключа у згрупованих даних
      if (!groupedData[key]) groupedData[key] = []
      groupedData[key].push(item)
    })
    return groupedData
  },

  // ВИТРАТИ
  transactionExpenses(state) {
    return state.transactionGetMyResultSorted.filter((el) => el.operation_type_id === 2)
  },
  transactionExpensesGrouped(state) {
    const groupedData = {}
    state.transactionExpenses?.forEach((item) => {
      // Створюємо ключ у вигляді "повна_назва_місяця рік"
      const key = dateToLocal(item.date, { dateStyle: 'long' })
      // Додаємо об'єкт до відповідного ключа у згрупованих даних
      if (!groupedData[key]) groupedData[key] = []
      groupedData[key].push(item)
    })
    return groupedData
  },

  // ПЕРЕКАЗИ
  transactionTransfer(state) {
    return state.transactionGetMyResultSorted.filter((el) => el.operation_type_id === 3)
  },
  transactionTransferGrouped(state) {
    const groupedData = {}
    state.transactionTransfer?.forEach((item) => {
      // Створюємо ключ у вигляді "повна_назва_місяця рік"
      const key = dateToLocal(item.date, { dateStyle: 'long' })
      // Додаємо об'єкт до відповідного ключа у згрупованих даних
      if (!groupedData[key]) groupedData[key] = []
      groupedData[key].push(item)
    })
    return groupedData
  },

  transactionGetMyResultGrouped(state) {
    const groupedData = {}
    state.transactionGetMyResultSorted?.forEach((item) => {
      // Створюємо ключ у вигляді "повна_назва_місяця рік"
      const key = dateToLocal(item.date, { dateStyle: 'long' })
      // Додаємо об'єкт до відповідного ключа у згрупованих даних
      if (!groupedData[key]) groupedData[key] = []
      groupedData[key].push(item)
    })
    return groupedData
  },
}
