import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { Transaction, TransactionType } from '../types/models'

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
    presetToAccountId?: string
    presetCategoryId?: string
    // "Дублювати" (see TransactionFormModal.vue's duplicateRequested) reopens
    // this same form as a fresh, unsaved operation prefilled from the one
    // being duplicated — these carry that starting amount/note/type/date
    // through, same as `transaction` does for a genuine edit.
    presetAmount?: number
    presetToAmount?: number
    presetNote?: string
    presetType?: TransactionType
    presetDate?: number
  }>({
    open: false,
    transaction: null,
    presetAccountId: undefined,
    presetToAccountId: undefined,
    presetCategoryId: undefined,
    presetAmount: undefined,
    presetToAmount: undefined,
    presetNote: undefined,
    presetType: undefined,
    presetDate: undefined,
  })

  function openTransactionForm(
    opts: {
      transaction?: Transaction | null
      presetAccountId?: string
      presetToAccountId?: string
      presetCategoryId?: string
      presetAmount?: number
      presetToAmount?: number
      presetNote?: string
      presetType?: TransactionType
      presetDate?: number
    } = {},
  ) {
    transactionForm.transaction = opts.transaction ?? null
    transactionForm.presetAccountId = opts.presetAccountId
    transactionForm.presetToAccountId = opts.presetToAccountId
    transactionForm.presetCategoryId = opts.presetCategoryId
    transactionForm.presetAmount = opts.presetAmount
    transactionForm.presetToAmount = opts.presetToAmount
    transactionForm.presetNote = opts.presetNote
    transactionForm.presetType = opts.presetType
    transactionForm.presetDate = opts.presetDate
    transactionForm.open = true
  }
  function closeTransactionForm() {
    transactionForm.open = false
  }

  // "Редагувати чек" — тепер це й "Фото чека" (скан + перегляд розпізнаного),
  // об'єднані в один ReceiptEditModal.vue: рахунок/дата/склад операцій
  // виглядають і поводяться однаково незалежно від того, як сюди потрапили.
  // Driven from here (rather than staying local to OperationsDataView.vue, as
  // it started out) because TransactionFormModal's own "Додати в чек" button
  // (see App.vue's handleAddToReceiptRequest) needs to open it from wherever
  // the transaction form happened to be opened from (Accounts, Categories,
  // Operations, Search), not just the Operations page. Exactly one of
  // `receiptId`/`seedTransaction`/`scanFile` is meaningful per open — see
  // ReceiptEditModal.vue's own three-mode doc comment.
  const receiptEdit = reactive<{
    open: boolean
    receiptId: string | null
    seedTransaction: Transaction | null
    scanFile: File | null
  }>({
    open: false,
    receiptId: null,
    seedTransaction: null,
    scanFile: null,
  })

  function openReceiptEdit(opts: { receiptId?: string | null; seedTransaction?: Transaction | null; scanFile?: File | null } = {}) {
    receiptEdit.receiptId = opts.receiptId ?? null
    receiptEdit.seedTransaction = opts.seedTransaction ?? null
    receiptEdit.scanFile = opts.scanFile ?? null
    receiptEdit.open = true
  }
  function closeReceiptEdit() {
    receiptEdit.open = false
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
    receiptEdit,
    openReceiptEdit,
    closeReceiptEdit,
    confirm,
    confirmDialog,
    closeConfirm,
  }
})
