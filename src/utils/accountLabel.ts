import type { Account, Profile } from '../types/models'

/**
 * Resolves an account's display name for a transaction row: the signed-in
 * profile's own accounts first, falling back to the cross-profile
 * `allAccounts` cache for a transfer counterparty's account (which never
 * appears in the per-profile `accounts` store) — prefixed with the owner's
 * name so it reads as "Ірина · Картка" instead of an ambiguous bare name.
 */
export function resolveAccountLabel(
  accountId: string | undefined,
  ownAccounts: Account[],
  allAccounts: Account[],
  profiles: Profile[],
): string {
  if (!accountId) return '?'
  const own = ownAccounts.find((a) => a.id === accountId)
  if (own) return own.name
  const foreign = allAccounts.find((a) => a.id === accountId)
  if (!foreign) return '?'
  const owner = profiles.find((p) => p.uid === foreign.ownerId)
  return `${owner?.displayName ?? '?'} · ${foreign.name}`
}
