import { defineStore } from 'pinia'
import state from './userState'
import actions from './userActions'
import getters from './userGetters'

export const useUserStore = defineStore('user', {
  state,
  getters,
  actions,
})
