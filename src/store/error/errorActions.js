import { useUserStore } from '@/store/user'

export default {
  errorFunction(error) {
    console.log('error', error)
    console.log('status', error?.response?.status)
    if (error?.response?.status === 401) {
      const userStore = useUserStore()
      userStore.logOut()
    }

    this.lastError = {
      name: error?.response?.data?.error?.name || error?.name,
      message: error?.response?.data?.error?.message || error?.message,
      stack: error?.response?.data?.error?.stack || error?.stack,
    }
    this.isShowModal = true
    return
  },
}
