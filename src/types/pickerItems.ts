import type { CurrencyDisplayStyle } from '../utils/format'

/**
 * Display-ready row for AccountPickerModal — accounts (own or a family
 * member's) already flattened out of their stores and tagged with a group
 * label ("Рахунки" / "Заощадження" / another profile's name) so the picker
 * itself stays a dumb, reusable list renderer.
 */
export interface AccountPickerItem {
  id: string
  name: string
  icon: string
  color: string
  currency: string
  // The source account's own Settings → "Формат валюти" override, if any
  // (see Account.currencyDisplay) — carried through so AccountPickerModal.vue
  // can format `balance` the same way the account's own card does.
  currencyDisplay?: CurrencyDisplayStyle | null
  balance?: number
  group: string
}
