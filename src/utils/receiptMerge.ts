import type { Transaction } from '../types/models'

/**
 * Number of transactions currently linked to a receipt, across the FULL
 * transaction list (not just whatever's visible in a filtered/period view) —
 * a receipt with only one linked item renders as a plain row rather than a
 * ReceiptGroupCard (see OperationsDataView.vue's groupByReceipt), so this is
 * what tells the difference between "already a real multi-item chek" and
 * "still just one operation with a receiptId sitting on it".
 */
export function receiptSize(all: Transaction[], receiptId: string): number {
  return all.filter((t) => t.receiptId === receiptId).length
}

/**
 * Whether a transaction is eligible to be merged into (or added onto) a
 * receipt: transfers never qualify (a chek only ever groups expense/income —
 * see Receipt in types/models.ts), and an already-grouped transaction only
 * qualifies if its own receipt is still "solo" (1 item) — a genuine 2+ chek
 * already has its own UI for growing it (ReceiptEditModal.vue's operation
 * picker), so this here is only ever the entry point into a BRAND NEW group.
 */
export function isMergeable(all: Transaction[], t: Transaction): boolean {
  if (t.type === 'transfer') return false
  return !t.receiptId || receiptSize(all, t.receiptId) <= 1
}
