import type { Transaction } from '../types/models'

/**
 * A transfer counts toward income/expense analytics (Overview, category
 * rankings) only when it moved money between two DIFFERENT profiles
 * (`participantIds` has 2 entries) — a same-profile transfer stays excluded,
 * since that's just moving your own money between your own accounts.
 */
export function isCrossProfileTransfer(t: Transaction): boolean {
  return t.type === 'transfer' && t.participantIds.length > 1
}

export const TRANSFER_CATEGORY_LABEL = 'Перекази'
export const TRANSFER_CATEGORY_ICON = 'mdiSwapHorizontal'
export const TRANSFER_CATEGORY_COLOR = '#4a3aa7'
