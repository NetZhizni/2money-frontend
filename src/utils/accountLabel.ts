import type { Account, Profile } from '../types/models'

/**
 * Resolves an account's display label from `effectiveUid`'s perspective —
 * bare name for that profile's own account, "Ім'я · Назва" (owner-prefixed)
 * for anyone else's. When `effectiveUid` is null ("all" view mode, where
 * there's no single owner to treat as "self"), every account gets the
 * prefix, which is what makes a transfer's counterparty account — or a
 * cross-profile transfer's direction — legible there.
 *
 * Looks up `accountId` in `allAccounts` (the cross-profile cache, which
 * already holds every owner's accounts — see stores/allAccounts.ts) rather
 * than a separate "own accounts" list, so the "is this effectiveUid's own
 * account" check is a plain ownerId comparison instead of array membership
 * that silently breaks once the caller's own-accounts list stops being
 * scoped to a single owner (exactly what happens in "all" mode).
 */
export function resolveAccountLabel(
  accountId: string | undefined,
  effectiveUid: string | null,
  allAccounts: Account[],
  profiles: Profile[],
): string {
  if (!accountId) return '?'
  const account = allAccounts.find((a) => a.id === accountId)
  if (!account) return '?'
  if (effectiveUid !== null && account.ownerId === effectiveUid) return account.name
  const owner = profiles.find((p) => p.uid === account.ownerId)
  return `${owner?.displayName ?? '?'} · ${account.name}`
}
