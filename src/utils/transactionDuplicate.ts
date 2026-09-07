import type { Transaction, TransactionType } from '../types/models'

/**
 * Fields to seed a fresh "create new transaction" form from an existing one —
 * used by "Дублювати" (see TransactionFormModal.vue's handleDuplicate). Unlike
 * the old one-tap duplicate (a straight DB copy via transactions.duplicate),
 * this only prefills the form so the user can still adjust the date, amount,
 * category, or account before it's actually saved as a new operation.
 *
 * `receiptId` is deliberately left out: a duplicate starts as its own
 * standalone operation instead of silently rejoining the original's receipt
 * group, which would also re-lock the account/date/type fields this is meant
 * to leave editable (see TransactionFormModal.vue's `lockedByReceipt`).
 *
 * Field names match TransactionFormModal's own `presetX` props 1:1 so a
 * preset can be spread straight into them (or into popups.ts's
 * `openTransactionForm`).
 */
export interface TransactionDuplicatePreset {
  presetType: TransactionType
  presetAccountId: string
  presetToAccountId?: string
  presetCategoryId?: string
  presetAmount: number
  presetToAmount?: number
  presetNote?: string
  presetDate: number
}

export function duplicatePresetFrom(tx: Transaction): TransactionDuplicatePreset {
  return {
    presetType: tx.type,
    presetAccountId: tx.accountId,
    presetToAccountId: tx.toAccountId,
    presetCategoryId: tx.subcategoryId ?? tx.categoryId ?? undefined,
    presetAmount: tx.amount,
    presetToAmount: tx.toAmount,
    presetNote: tx.note,
    presetDate: tx.date,
  }
}
