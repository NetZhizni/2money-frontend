import { useViewAsStore } from './viewAs'
import { t } from '../i18n'

/**
 * Shared "no writes while viewing another profile read-only" guard — every mutating
 * store (accounts/transactions/budgets/receipts/categories) calls this first. The UI
 * never exposes create/edit/delete affordances while `viewAs.isReadOnly` is true, so
 * this should never actually fire — it's just a loud failure if something slips through.
 */
export function assertWritable(): void {
  const viewAs = useViewAsStore()
  if (viewAs.isReadOnly) throw new Error(t('errors.readOnlyProfile'))
}
