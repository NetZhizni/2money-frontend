import http from './http'

/** One day's rates as the backend stores them — see db/exchangeRates.ts's RateSnapshot. */
export interface ServerRateSnapshot {
  date: string // YYYY-MM-DD
  rates: Record<string, number>
}

export interface RateSnapshotsResponse {
  snapshots: ServerRateSnapshot[] // only the requested days the server has (or could download) — any other is simply absent
  latest: ServerRateSnapshot | null // today's rates, when asked for — stored under the day the rates API says they're for
}

/**
 * POST /api/rates/snapshots — the backend's shared, read-through cache of
 * the rates API (see backend/src/services/internal/rates/getRateSnapshots.js).
 * Bounded by a timeout: the server itself stops waiting on slow downloads
 * after 15 s, so anything taking far longer is a network problem, and the
 * caller falls back to the rates API directly.
 */
export async function fetchRateSnapshots(dates: string[], latest: boolean): Promise<RateSnapshotsResponse> {
  const { data } = await http.post<RateSnapshotsResponse>('/rates/snapshots', { dates, latest }, { timeout: 30_000 })
  return data
}
