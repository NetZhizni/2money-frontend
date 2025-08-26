import { defineStore } from 'pinia'
import state from './errorState'
import actions from './errorActions'
import getters from './errorGetters'

export const useErrorStore = defineStore('error', {
  state,
  getters,
  actions,
})
