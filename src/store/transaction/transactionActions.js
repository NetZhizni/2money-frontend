import { univesalAPI } from '@/api'
import { useErrorStore } from '@/store/error'

export default {
  async transactionGetMy() {
    this.transactionGetMyResult = await univesalAPI('transactionGetMy', {})
  },

  async transactionCreate(params) {
    try {
      await univesalAPI('transactionCreate', {
        date: params.date,
        operation_type_id: params.operation_type_id,
        from_account_id: params.from_account_id,
        from_amount: params.from_amount,
        to_account_id: params.to_account_id,
        to_amount: params.to_amount,
        comment: params.comment,
      })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },

  async transactionUpdate(params) {
    try {
      await univesalAPI('transactionUpdate', {
        id: params.id,
        date: params.date,
        operation_type_id: params.operation_type_id,
        from_account_id: params.from_account_id,
        from_amount: params.from_amount,
        to_account_id: params.to_account_id,
        to_amount: params.to_amount,
        comment: params.comment,
      })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },

  async transactionDelete(id) {
    try {
      await univesalAPI('transactionDelete', { id })
    } catch (error) {
      const errorStore = useErrorStore()
      errorStore.errorFunction(error)
    }
  },
}
