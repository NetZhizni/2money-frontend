import { db } from './schema'
import { enqueueUpsertMany, pullAllCategories } from './sync'
import { DEFAULT_EXPENSE_CATEGORY_DEFS, DEFAULT_INCOME_CATEGORY_DEFS } from './defaultCategories'
import http from '../api/http'
import { newId } from '../utils/id'
import { t } from '../i18n'
import { getChosenBaseCurrency } from '../utils/baseCurrencyChoice'
import type { Category } from '../types/models'

/**
 * Builds the default category set as real `Category` rows, named in
 * whichever locale is active right now (see defaultCategories.ts's own doc
 * comment for how a category is matched back to its def later, to re-label
 * it on a language change). Shared by both `seedDefaultsIfEmpty` (automatic,
 * family-wide, first login ever) and `seedDefaultCategoriesNow` (manual, from
 * Settings) below — the only difference between the two is the race-guard
 * jitter and `onboarded` bookkeeping, both meaningless outside the very-first
 * login flow.
 */
function buildDefaultCategories(ownerId: string): Category[] {
  const now = Date.now()
  const categories: Category[] = []
  DEFAULT_EXPENSE_CATEGORY_DEFS.forEach((def, order) => {
    categories.push({
      id: newId(),
      ownerId,
      name: t(def.key),
      kind: def.kind,
      icon: def.icon,
      color: def.color,
      parentId: null,
      archived: false,
      order,
      createdAt: now,
      isDefault: true,
    })
  })
  DEFAULT_INCOME_CATEGORY_DEFS.forEach((def, order) => {
    categories.push({
      id: newId(),
      ownerId,
      name: t(def.key),
      kind: def.kind,
      icon: def.icon,
      color: def.color,
      parentId: null,
      archived: false,
      order,
      createdAt: now,
      isDefault: true,
    })
  })
  return categories
}

/**
 * Staggers two devices that both reach seedDefaultsIfEmpty() at effectively
 * the same instant (e.g. two brand-new family members finishing sign-in
 * within the same moment) so they don't both see zero categories and each
 * write their own duplicate default set. Doesn't eliminate the race — a
 * genuine fix needs a server-side uniqueness guarantee (a DB constraint, or
 * an atomic "seed once" endpoint), which is out of reach from the client
 * alone — it just makes the window one device has to lose the race in a
 * random ~150-500ms spread plus a network round trip instead of a single
 * event-loop tick, which in practice is enough for whichever device pulls
 * second to see the first one's already-synced set.
 */
function onboardingJitterMs(): number {
  return 150 + Math.random() * 350
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
 * Re-checks once more after a short jitter (see onboardingJitterMs) right
 * before actually writing, to narrow — not close — that same race further.
 *
 * Only top-level categories are seeded here — no subcategories (e.g. no
 * "Обід на роботі" under "Кафе і ресторани") — so a brand-new family starts
 * with the cleanest possible list. db/demoData.ts creates the couple of
 * default subcategories it actually needs lazily, on demand.
 */
export async function seedDefaultsIfEmpty(ownerId: string): Promise<void> {
  await pullAllCategories().catch((error) =>
    console.warn('[seed] pullAllCategories failed, deciding from local cache only', error),
  )
  if ((await db.categories.count()) > 0) return

  await new Promise((resolve) => setTimeout(resolve, onboardingJitterMs()))
  await pullAllCategories().catch((error) =>
    console.warn('[seed] pullAllCategories re-check failed, deciding from local cache only', error),
  )
  if ((await db.categories.count()) > 0) return

  const categories = buildDefaultCategories(ownerId)
  await db.categories.bulkPut(categories)
  await enqueueUpsertMany('categories', ownerId, categories)

  const existing = await db.settings.get(ownerId)
  await db.settings.put({
    id: ownerId,
    baseCurrency: existing?.baseCurrency ?? getChosenBaseCurrency() ?? 'UAH',
    theme: existing?.theme ?? 'system',
    onboarded: true,
  })
  try {
    await http.patch('/settings', { onboarded: true })
  } catch (error) {
    console.warn('[seed] onboarded PATCH failed, will reconcile on next successful settings change', error)
  }
}

/**
 * Manual counterpart to seedDefaultsIfEmpty — creates the exact same default
 * set on demand, from Settings → Дані → "Створити базові категорії". Meant
 * for reseeding after "Очистити всі категорії" (e.g. to start over in a
 * different language than whatever the categories were first created in),
 * so it refuses outright if the family already has ANY category — this can
 * never create a duplicate set, and there's no jitter/race-guard to worry
 * about here since it's an explicit, one-off user action, not something two
 * devices could both trigger unattended at once.
 */
export async function seedDefaultCategoriesNow(ownerId: string): Promise<void> {
  if ((await db.categories.count()) > 0) {
    throw new Error(t('errors.categoriesNotEmpty'))
  }
  const categories = buildDefaultCategories(ownerId)
  await db.categories.bulkPut(categories)
  await enqueueUpsertMany('categories', ownerId, categories)
}

