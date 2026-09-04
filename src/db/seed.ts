import { db } from './schema'
import { enqueueUpsertMany, pullAllCategories } from './sync'
import http from '../api/http'
import { newId } from '../utils/id'
import { t } from '../i18n'
import type { Category } from '../types/models'

/**
 * Default category set shown on first launch (no accounts/transactions are
 * seeded — those start empty per spec). Icons are MDI keys, colors follow the
 * app's decorative badge palette (see utils/color.ts) chosen to match the
 * reference app's look. Names are resolved through `t()` (not
 * `db/demoData.ts`'s opt-in sample data, which stays Ukrainian-only by
 * design) since this is the real, permanent category set every new family
 * actually starts with.
 */
function defaultExpenseCategories(): Array<Pick<Category, 'name' | 'icon' | 'color'>> {
  return [
    { name: t('seed.expense.groceries'), icon: 'mdiFridgeOutline', color: '#2a78d6' },
    { name: t('seed.expense.cafes'), icon: 'mdiSilverwareForkKnife', color: '#e34948' },
    { name: t('seed.expense.leisure'), icon: 'mdiTicketOutline', color: '#e87ba4' },
    { name: t('seed.expense.transport'), icon: 'mdiBus', color: '#eda100' },
    { name: t('seed.expense.shopping'), icon: 'mdiShoppingOutline', color: '#8d6e63' },
    { name: t('seed.expense.clothing'), icon: 'mdiHanger', color: '#8a8d91' },
    { name: t('seed.expense.gifts'), icon: 'mdiGiftOutline', color: '#eb6834' },
    { name: t('seed.expense.communication'), icon: 'mdiWeb', color: '#1baf7a' },
    { name: t('seed.expense.home'), icon: 'mdiHomeOutline', color: '#008300' },
    { name: t('seed.expense.car'), icon: 'mdiCarOutline', color: '#8a8d91' },
    { name: t('seed.expense.health'), icon: 'mdiMedicalBag', color: '#e34948' },
    { name: t('seed.expense.selfDevelopment'), icon: 'mdiChartLine', color: '#1baf7a' },
    { name: t('seed.expense.beautyAndHygiene'), icon: 'mdiEmoticonOutline', color: '#eda100' },
    { name: t('seed.expense.pets'), icon: 'mdiPaw', color: '#1baf7a' },
  ]
}

function defaultIncomeCategories(): Array<Pick<Category, 'name' | 'icon' | 'color'>> {
  return [
    { name: t('seed.income.salary'), icon: 'mdiCashMultiple', color: '#008300' },
    { name: t('seed.income.sideJob'), icon: 'mdiBriefcaseOutline', color: '#2a78d6' },
    { name: t('seed.income.gifts'), icon: 'mdiGiftOpenOutline', color: '#e87ba4' },
    { name: t('seed.income.other'), icon: 'mdiDotsHorizontalCircleOutline', color: '#8a8d91' },
  ]
}

/**
 * Categories are a shared family resource (see stores/categories.ts) — this
 * seeds the default set exactly once, family-wide, the very first time
 * anyone finds it empty. Every member after that just inherits the
 * already-seeded shared set via the normal sync pull; there's no more
 * "per-profile" seeding. Explicitly pulls first (rather than trusting
 * whatever `fullSync`'s own unawaited background pull happens to have landed
 * by now) so a second family member's fresh device doesn't race the check
 * and wrongly reseed a duplicate set alongside what the family already has.
 */
export async function seedDefaultsIfEmpty(ownerId: string): Promise<void> {
  await pullAllCategories().catch((error) =>
    console.warn('[seed] pullAllCategories failed, deciding from local cache only', error),
  )
  if ((await db.categories.count()) > 0) return

  const now = Date.now()
  const categories: Category[] = []
  let order = 0

  for (const c of defaultExpenseCategories()) {
    categories.push({
      id: newId(),
      ownerId,
      name: c.name,
      kind: 'expense',
      icon: c.icon,
      color: c.color,
      parentId: null,
      archived: false,
      order: order++,
      createdAt: now,
      isDefault: true,
    })
  }
  order = 0
  for (const c of defaultIncomeCategories()) {
    categories.push({
      id: newId(),
      ownerId,
      name: c.name,
      kind: 'income',
      icon: c.icon,
      color: c.color,
      parentId: null,
      archived: false,
      order: order++,
      createdAt: now,
      isDefault: true,
    })
  }

  await db.categories.bulkPut(categories)
  await enqueueUpsertMany('categories', ownerId, categories)

  const existing = await db.settings.get(ownerId)
  await db.settings.put({ id: ownerId, baseCurrency: existing?.baseCurrency ?? 'UAH', theme: existing?.theme ?? 'system', onboarded: true })
  try {
    await http.patch('/settings', { onboarded: true })
  } catch (error) {
    console.warn('[seed] onboarded PATCH failed, will reconcile on next successful settings change', error)
  }
}
