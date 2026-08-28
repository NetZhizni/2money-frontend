import { db } from './schema'
import { enqueueUpsertMany, pullAllCategories } from './sync'
import http from '../api/http'
import { newId } from '../utils/id'
import type { Category } from '../types/models'

/**
 * Default category set shown on first launch (no accounts/transactions are
 * seeded — those start empty per spec). Icons are MDI keys, colors follow the
 * app's decorative badge palette (see utils/color.ts) chosen to match the
 * reference app's look.
 */
const DEFAULT_EXPENSE_CATEGORIES: Array<Pick<Category, 'name' | 'icon' | 'color'>> = [
  { name: 'Продукти', icon: 'mdiFridgeOutline', color: '#2a78d6' },
  { name: 'Кафе і ресторани', icon: 'mdiSilverwareForkKnife', color: '#e34948' },
  { name: 'Дозвілля', icon: 'mdiTicketOutline', color: '#e87ba4' },
  { name: 'Транспорт', icon: 'mdiBus', color: '#eda100' },
  { name: 'Покупки', icon: 'mdiShoppingOutline', color: '#8d6e63' },
  { name: 'Одяг', icon: 'mdiHanger', color: '#8a8d91' },
  { name: 'Подарунки', icon: 'mdiGiftOutline', color: '#eb6834' },
  { name: "Зв'язок", icon: 'mdiWeb', color: '#1baf7a' },
  { name: 'Дім', icon: 'mdiHomeOutline', color: '#008300' },
  { name: 'Машина', icon: 'mdiCarOutline', color: '#8a8d91' },
  { name: "Здоров'я", icon: 'mdiMedicalBag', color: '#e34948' },
  { name: 'Розвиток', icon: 'mdiChartLine', color: '#1baf7a' },
  { name: 'Краса і чистота', icon: 'mdiEmoticonOutline', color: '#eda100' },
  { name: 'Домашні тварини', icon: 'mdiPaw', color: '#1baf7a' },
]

const DEFAULT_INCOME_CATEGORIES: Array<Pick<Category, 'name' | 'icon' | 'color'>> = [
  { name: 'Зарплата', icon: 'mdiCashMultiple', color: '#008300' },
  { name: 'Підробіток', icon: 'mdiBriefcaseOutline', color: '#2a78d6' },
  { name: 'Подарунки', icon: 'mdiGiftOpenOutline', color: '#e87ba4' },
  { name: 'Інше', icon: 'mdiDotsHorizontalCircleOutline', color: '#8a8d91' },
]

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

  for (const c of DEFAULT_EXPENSE_CATEGORIES) {
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
  for (const c of DEFAULT_INCOME_CATEGORIES) {
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
