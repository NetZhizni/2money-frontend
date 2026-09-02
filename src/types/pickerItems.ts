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
  balance?: number
  group: string
}
