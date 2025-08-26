import { defineStore } from 'pinia'
import state from './transactionState'
import actions from './transactionActions'
import getters from './transactionGetters'

export const useTransactionStore = defineStore('transaction', {
  state,
  getters,
  actions,
})
