/**
 * This device's clock, corrected to the server's. Every queued change is
 * stamped with when it was made (OutboxEntry.createdAt, sent as `editedAt`),
 * and the server settles two devices' writes to the same record by those
 * stamps (see the backend's sync/engine.js upsertStatement). With raw
 * Date.now(), a phone whose clock runs a few minutes behind would lose to
 * edits it actually came after, and one running ahead would win over edits
 * made after it — the server clamps that second case to its own clock, but
 * only on arrival, so an offline edit from a fast clock still counts as later
 * than it was.
 *
 * So every pull measures how far this clock is from the database's (the
 * server answers with its `serverNow`), and stamps are Date.now() plus that
 * offset. The offset is remembered across reloads, so an app that starts
 * offline stamps with the last one it knew rather than the raw clock.
 */
const STORAGE_KEY = 'stork:clockOffsetMs'

/**
 * A sample taken over a slower round trip than this is ignored: the server's
 * clock was read somewhere inside it, and the midpoint guess can be off by up
 * to half of it.
 */
export const MAX_SAMPLE_RTT_MS = 10_000

function readStored(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

let offset = readStored()

/** Now, on the server's clock — what every change is stamped with. */
export function serverNow(): number {
  return Date.now() + offset
}

/** A stamp from serverNow() back on this device's clock — for showing it next to Date.now(). */
export function toLocalTime(serverTime: number): number {
  return serverTime - offset
}

/**
 * Takes one measurement: the server read its clock as `serverTime` somewhere
 * between `sentAt` and `receivedAt` (both Date.now() here), assumed halfway.
 */
export function noteServerTime(serverTime: unknown, sentAt: number, receivedAt: number): void {
  if (typeof serverTime !== 'number' || !Number.isFinite(serverTime)) return
  const rtt = receivedAt - sentAt
  if (rtt < 0 || rtt > MAX_SAMPLE_RTT_MS) return
  offset = Math.round(serverTime - (sentAt + receivedAt) / 2)
  try {
    localStorage.setItem(STORAGE_KEY, String(offset))
  } catch {
    // Storage unavailable — the offset still holds for this session.
  }
}
