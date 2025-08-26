import { defineStore } from 'pinia'
import state from './accountState'
import actions from './accountActions'
import getters from './accountGetters'

export const useAccountStore = defineStore('account', {
  state,
  getters,
  actions,
})
