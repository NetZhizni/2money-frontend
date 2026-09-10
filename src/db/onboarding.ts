import { db } from './schema'
import { pullAllAccounts, pullAllTransactions } from './sync'
import http from '../api/http'
import { getChosenBaseCurrency } from '../utils/baseCurrencyChoice'

/**
 * Whether THIS profile — not the family as a whole — still needs
 * views/OnboardingView.vue's "start fresh or import a backup" choice, used
 * by App.vue to decide whether to show it instead of silently proceeding
 * straight into the app.
 *
 * Checks the persisted `onboarded` flag first (see markOnboardingDone below)
 * rather than jumping straight to the accounts/transactions check that used
 * to be this function's only signal: "start fresh" deliberately creates no
 * accounts/transactions of its own (only categories, and only if the family
 * had none yet — see db/seed.ts's seedDefaultsIfEmpty), so a profile that
 * picked it and hasn't added anything since would otherwise trip the
 * data-based check again on every reload or new device, right back into
 * this same screen. Falling through to that data-based check for anyone
 * without the flag set keeps this working for every profile that reached
 * "has its own data" before markOnboardingDone existed.
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
  const settings = await db.settings.get(uid)
  if (settings?.onboarded) return false

  await Promise.allSettled([pullAllAccounts(), pullAllTransactions()])
  const [accountCount, transactionCount] = await Promise.all([
    db.accounts.where('ownerId').equals(uid).count(),
    db.transactions.filter((tx) => tx.ownerId === uid).count(),
  ])
  return accountCount === 0 && transactionCount === 0
}

/**
 * Records that THIS profile has resolved OnboardingView.vue's choice —
 * called once from App.vue's handleOnboardingDone, right after any of its
 * three options (fresh start, personal import, family restore). Unlike
 * db/seed.ts's own `onboarded` write, which only ever fires for whichever
 * family member happens to seed the shared category set first, this one
 * fires unconditionally for whoever just went through the screen — a
 * second, third, ... member picking "start fresh" needs their OWN flag set
 * too, since seedDefaultsIfEmpty will have no-op'd for them (the family
 * already had categories) and left their own accounts/transactions empty,
 * which is exactly what hasNoOwnDataYet() above now checks this flag to
 * cover. Best-effort PATCH mirrors seed.ts's: harmless if it fails (offline,
 * local mode with no server at all) since the local write already landed.
 */
export async function markOnboardingDone(uid: string): Promise<void> {
  const existing = await db.settings.get(uid)
  await db.settings.put({
    id: uid,
    baseCurrency: existing?.baseCurrency ?? getChosenBaseCurrency() ?? 'UAH',
    theme: existing?.theme ?? 'system',
    onboarded: true,
  })
  try {
    await http.patch('/settings', { onboarded: true })
  } catch (error) {
    console.warn('[onboarding] onboarded PATCH failed, will reconcile on next successful settings change', error)
  }
}
