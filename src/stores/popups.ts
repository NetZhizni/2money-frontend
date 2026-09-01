import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { Transaction } from '../types/models'

/**
 * Central state for the popups that are genuinely shared across multiple
 * pages — today, primarily "create/edit a transaction" (reachable from
 * Accounts, Categories, Operations, and Search) and the generic confirm
 * dialog (used by every "delete this" flow). Each is mounted exactly once,
 * permanently, in App.vue — driven entirely by this store's state instead of
 * a per-page `v-if` — so opening it from any page reuses the same Modal
 * instance and its `<Transition>` plays correctly on every open/close (see
 * Modal.vue's `open` prop).
 *
 * Popups that only ever have one caller (account/category forms & detail
 * sheets, filters, pickers, settings, …) stay local to that caller — they
 * get the same `open`-prop fix, just without the extra indirection of going
 * through this store.
 */
export const usePopupsStore = defineStore('popups', () => {
  const transactionForm = reactive<{
    open: boolean
    transaction: Transaction | null
    presetAccountId?: string
    presetCategoryId?: string
  }>({ open: false, transaction: null, presetAccountId: undefined, presetCategoryId: undefined })

  function openTransactionForm(
    opts: { transaction?: Transaction | null; presetAccountId?: string; presetCategoryId?: string } = {},
  ) {
    transactionForm.transaction = opts.transaction ?? null
    transactionForm.presetAccountId = opts.presetAccountId
    transactionForm.presetCategoryId = opts.presetCategoryId
    transactionForm.open = true
  }
  function closeTransactionForm() {
    transactionForm.open = false
  }

  const confirm = reactive<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
    onConfirm: (() => void | Promise<void>) | null
  }>({ open: false, title: '', message: '', confirmLabel: undefined, danger: false, onConfirm: null })

  /** Opens the shared confirm dialog; `onConfirm` runs on accept and is responsible for closing it (via closeConfirm) once done. */
  function confirmDialog(opts: {
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
    onConfirm: () => void | Promise<void>
  }) {
    confirm.title = opts.title
    confirm.message = opts.message
    confirm.confirmLabel = opts.confirmLabel
    confirm.danger = opts.danger ?? false
    confirm.onConfirm = opts.onConfirm
    confirm.open = true
  }
  function closeConfirm() {
    confirm.open = false
  }

  return {
    transactionForm,
    openTransactionForm,
    closeTransactionForm,
    confirm,
    confirmDialog,
    closeConfirm,
  }
})
