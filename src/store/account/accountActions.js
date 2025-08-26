import { univesalAPI } from '@/api'
import { useErrorStore } from '@/store/error'

export default {
  async accountGetMyWallets() {
    try {
      this.accountGetMyWalletsResult = await univesalAPI('accountGetMyWallets', {})
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
  async accountGetIncome() {
    try {
      this.accountGetIncomeResult = await univesalAPI('accountGetIncome', {})
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
  async accountGetExpenses() {
    try {
      this.accountGetExpensesResult = await univesalAPI('accountGetExpenses', {})
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
  async accountGetNotMyWallets() {
    try {
      this.accountGetNotMyWalletsResult = await univesalAPI('accountGetNotMyWallets', {})
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },

  async accountGetMy() {
    await Promise.allSettled([
      this.accountGetMyWallets(),
      this.accountGetIncome(),
      this.accountGetExpenses(),
      this.accountGetNotMyWallets(),
    ])
  },

  async accountCreate(accountTypeId, params) {
    try {
      await univesalAPI('accountCreate', {
        name: params.name,
        currency: params.currency,
        account_type_id: accountTypeId,
        initial_balance: +params.initial_balance,
        icon: params.icon,
        color: params.color,
        is_archive: false,
      })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
  async accountUpdate(params) {
    try {
      await univesalAPI('accountUpdate', {
        id: params.id,
        name: params.name,
        currency: params.currency,
        account_type_id: params.account_type_id,
        initial_balance: +params.initial_balance,
        icon: params.icon,
        color: params.color,
        is_archive: params.is_archive,
      })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
  async categoryCreate(accountTypeId, params) {
    try {
      await univesalAPI('accountCreate', {
        name: params.name,
        currency: params.currency,
        account_type_id: accountTypeId,
        initial_balance: null,
        icon: params.icon,
        color: params.color,
        is_archive: params.is_archive,
      })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
  async categoryUpdate(params) {
    try {
      await univesalAPI('accountUpdate', {
        id: params.id,
        name: params.name,
        currency: params.currency,
        account_type_id: params.account_type_id,
        initial_balance: null,
        icon: params.icon,
        color: params.color,
        is_archive: params.is_archive,
      })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
}
