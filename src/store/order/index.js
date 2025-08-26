import { defineStore } from 'pinia'
import actions from './orderActions'
import getters from './orderGetters'
import state from './orderState'

export const useOrderStore = defineStore('order', {
  state,
  getters,
  actions,
})
