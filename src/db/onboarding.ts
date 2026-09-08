import { db } from './schema'
import { pullAllAccounts, pullAllTransactions } from './sync'

/**
 * Whether THIS profile — not the family as a whole — has any of its own
 * accounts or transactions yet. Used by App.vue to decide whether to show
 * views/OnboardingView.vue's "start fresh or import a backup" choice
 * instead of silently proceeding straight into the app (see
 * db/seed.ts's seedDefaultsIfEmpty for the sibling check this deliberately
 * does NOT reuse: "family has zero categories" is only true once, for
 * whoever happens to be first — a second, third, ... family member's very
 * first login should get the exact same choice — bring their own history
 * along, or start clean — even though the family itself already has
 * categories/other members' data by then).
 *
 * Pulls this profile's own slice fresh first (best-effort, same as any other
 * pull in this app) so a brand-new DEVICE for an ALREADY-active profile
 * never sees this just because its local cache hasn't caught up yet. That
 * pull being stale or skipped (offline) can only ever make this return true
 * when it should have returned false — never the other way round — and
 * doing so is harmless: OnboardingView.vue's choices are both non-destructive
 * (start fresh seeds nothing but the shared default categories, and only if
 * the family doesn't have any yet; importing only ever adds), so the worst
 * case is a superfluous screen shown once, not lost or corrupted data.
 */
export async function hasNoOwnDataYet(uid: string): Promise<boolean> {
  await Promise.allSettled([pullAllAccounts(), pullAllTransactions()])
  const [accountCount, transactionCount] = await Promise.all([
    db.accounts.where('ownerId').equals(uid).count(),
    db.transactions.filter((tx) => tx.ownerId === uid).count(),
  ])
  return accountCount === 0 && transactionCount === 0
}
