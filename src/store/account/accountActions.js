import { univesalAPI } from '@/api'
import { useErrorStore } from '@/store/error'

export default {
  updateAccount(editItem) {
    this.accounts.splice(
      this.accounts.findIndex((item) => item.id === editItem.id),
      1,
      editItem,
    )
  },
  addAccount(createItem) {
    this.accounts.push(createItem)
  },
}
