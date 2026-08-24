import { v7 as uuidv7 } from 'uuid'

/**
 * UUIDv7 (time-ordered), generated here on the client — offline-first means
 * a new record needs its id the moment it's created, with no round trip to
 * the server. The backend accepts client-generated ids as-is (POST is an
 * idempotent upsert keyed by id — see src/db/sync.ts's outbox replay).
 */
export function newId(): string {
  return uuidv7()
}
