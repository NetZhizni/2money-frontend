import { getActivePinia } from 'pinia'
import { firebaseAuth, auth, provider } from '@/utils/firebase'
import { useErrorStore } from '@/store/error'
import { univesalAPI } from '@/api'

export default {
  async signInWithPopup() {
    await firebaseAuth.signInWithPopup(auth, provider)
  },

  async onAuthStateChanged() {
    firebaseAuth.onAuthStateChanged(auth, async (user) => {
      this.isLoading = true
      try {
        this.user = user
        if (user) await this.userGetInfo(user)
        else await this.logOut()
      } catch (error) {
        const errorStore = useErrorStore()
        errorStore.errorFunction(error)
      } finally {
        this.isLoading = false
      }
    })
  },

  async userGetInfo(user) {
    this.user = user
    this.getInfoResult = await univesalAPI('getCurrentUser')
  },

  async logOut() {
    firebaseAuth.signOut(auth).catch((error) => {
      console.error('Error signing out:', error)
    })
    const activeStoresMap = getActivePinia()
    activeStoresMap.forEach((value, key) => {
      if (key !== 'error') value.$reset()
    })
    this.isLoading = false
  },
}
