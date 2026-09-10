import type { CategoryKind } from '../types/models'
import type { MessageKey } from '../i18n'

/**
 * The one, shared definition of the app's default ("basic") category set —
 * used by db/seed.ts (both the automatic first-login seed and the manual
 * "Створити базові категорії" button in Settings) to create the real,
 * permanent categories, and by db/demoData.ts to know which category to file
 * a given kind of sample transaction under. Redesigned as a single coherent
 * set on purpose: demo data is filed against these SAME categories (not a
 * demo-only set of its own), so every family's category list stays exactly
 * what a real one would look like even right after "Додати демо-дані".
 *
 * `key` is the seedMessages message key that names this category — resolving
 * it via `t()`/`tFor()` at creation time is what makes a new category read
 * correctly in whichever language was active when it was made.
 *
 * A category made from one of these carries `isDefault: true` (see
 * types/models.ts's Category) plus this exact `icon`, purely as a
 * fingerprint: stores/categories.ts's `retranslateDefaults` matches a
 * category back to its def by `(kind, icon)` — there's no separate field
 * persisted for this — to re-label it when the language changes. Editing
 * either the name or the icon by hand naturally drops a category out of that
 * match (a changed icon no longer fingerprints any def; a changed name no
 * longer equals either locale's known translation), which is exactly the
 * "the user has customized this, stop auto-translating it" behavior wanted —
 * no extra bookkeeping needed for it either.
 */
export interface DefaultCategoryDef {
  key: MessageKey
  kind: CategoryKind
  icon: string
  color: string
}

export const DEFAULT_EXPENSE_CATEGORY_DEFS: DefaultCategoryDef[] = [
  { key: 'seed.expense.groceries', kind: 'expense', icon: 'mdiCartOutline', color: '#2a78d6' },
  { key: 'seed.expense.cafes', kind: 'expense', icon: 'mdiSilverwareForkKnife', color: '#e34948' },
  { key: 'seed.expense.transport', kind: 'expense', icon: 'mdiBus', color: '#eda100' },
  { key: 'seed.expense.car', kind: 'expense', icon: 'mdiCarOutline', color: '#8a8d91' },
  { key: 'seed.expense.shopping', kind: 'expense', icon: 'mdiShoppingOutline', color: '#8d6e63' },
  { key: 'seed.expense.leisure', kind: 'expense', icon: 'mdiTicketOutline', color: '#e87ba4' },
  { key: 'seed.expense.travel', kind: 'expense', icon: 'mdiAirplane', color: '#2a9d8f' },
  { key: 'seed.expense.gifts', kind: 'expense', icon: 'mdiGiftOutline', color: '#eb6834' },
  { key: 'seed.expense.communication', kind: 'expense', icon: 'mdiWifi', color: '#1baf7a' },
  { key: 'seed.expense.home', kind: 'expense', icon: 'mdiHomeOutline', color: '#008300' },
  { key: 'seed.expense.health', kind: 'expense', icon: 'mdiMedicalBag', color: '#e34948' },
  { key: 'seed.expense.selfDevelopment', kind: 'expense', icon: 'mdiSchoolOutline', color: '#1baf7a' },
  { key: 'seed.expense.beautyAndHygiene', kind: 'expense', icon: 'mdiSpa', color: '#eda100' },
  { key: 'seed.expense.pets', kind: 'expense', icon: 'mdiPaw', color: '#1baf7a' },
]

export const DEFAULT_INCOME_CATEGORY_DEFS: DefaultCategoryDef[] = [
  { key: 'seed.income.salary', kind: 'income', icon: 'mdiCashMultiple', color: '#008300' },
  { key: 'seed.income.sideJob', kind: 'income', icon: 'mdiBriefcaseOutline', color: '#2a78d6' },
  { key: 'seed.income.gifts', kind: 'income', icon: 'mdiGiftOpenOutline', color: '#e87ba4' },
  { key: 'seed.income.investments', kind: 'income', icon: 'mdiChartLine', color: '#1baf7a' },
  { key: 'seed.income.other', kind: 'income', icon: 'mdiDotsHorizontalCircleOutline', color: '#8a8d91' },
]

export const DEFAULT_CATEGORY_DEFS: DefaultCategoryDef[] = [...DEFAULT_EXPENSE_CATEGORY_DEFS, ...DEFAULT_INCOME_CATEGORY_DEFS]

/**
 * A default SUBcategory — inherits its parent's icon/color like every
 * subcategory does (see CategoryFormModal.vue), so it fingerprints for
 * retranslateDefaults the same way: `(kind, icon)` still resolves uniquely
 * because it's matched against the PARENT def's icon, scoped to subcategories
 * of that one parent (see retranslateDefaults). Only ever created lazily by
 * db/demoData.ts, on demand — never by the real onboarding seed (see
 * seed.ts's own doc comment for why a brand-new family starts with top-level
 * categories only).
 */
export interface DefaultSubcategoryDef {
  key: MessageKey
  parentKey: MessageKey
}

export const DEFAULT_SUBCATEGORY_DEFS: DefaultSubcategoryDef[] = [
  { key: 'seed.expense.cafes.lunch', parentKey: 'seed.expense.cafes' },
  { key: 'seed.expense.shopping.clothing', parentKey: 'seed.expense.shopping' },
]

/** Just enough of a def for stores/categories.ts's retranslateDefaults to fingerprint-match against — `kind`/`icon` for a subcategory entry are copied from its parent def, same as the real Category row demoData.ts creates for it. */
export interface FlatDefaultDef {
  key: MessageKey
  kind: CategoryKind
  icon: string
}

function subcategoryFlatDef(sub: DefaultSubcategoryDef): FlatDefaultDef {
  const parent = DEFAULT_CATEGORY_DEFS.find((d) => d.key === sub.parentKey)
  if (!parent) throw new Error(`[defaultCategories] unknown parentKey "${sub.parentKey}" for subcategory "${sub.key}"`)
  return { key: sub.key, kind: parent.kind, icon: parent.icon }
}

/** Every default def — top-level AND subcategory — flattened for retranslateDefaults' single lookup. */
export const ALL_DEFAULT_CATEGORY_DEFS: FlatDefaultDef[] = [
  ...DEFAULT_CATEGORY_DEFS,
  ...DEFAULT_SUBCATEGORY_DEFS.map(subcategoryFlatDef),
]
