import type { Transaction } from '../types/models'
import { t } from '../i18n'

/**
 * A transfer counts toward income/expense analytics (Overview, category
 * rankings) only when it moved money between two DIFFERENT profiles
 * (`participantIds` has 2 entries) — a same-profile transfer stays excluded,
 * since that's just moving your own money between your own accounts.
 */
export function isCrossProfileTransfer(t: Transaction): boolean {
  return t.type === 'transfer' && t.participantIds.length > 1
}

/** Display name for the transfers pseudo-category — a function, not a constant, since it must follow the current locale. */
export function transferCategoryLabel(): string {
  return t('overview.transfers')
}
export const TRANSFER_CATEGORY_ICON = 'mdiSwapHorizontal'
export const TRANSFER_CATEGORY_COLOR = '#4a3aa7'
