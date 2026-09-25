/**
 * Runs `work` while holding the named Web Lock, so a job can't run in two tabs
 * (or a tab and the installed PWA) at once. Each tab has its own copy of the
 * in-memory guards (see outbox.ts's pushInFlight), but they all share one
 * IndexedDB — without this, two tabs would drain the same outbox side by side
 * and both generate the same recurring operations (see db/recurring.ts). A
 * second caller waits for the first to finish, then runs against whatever it
 * left behind.
 *
 * Not reentrant: `work` must never take the same lock again.
 *
 * Where the Web Locks API is missing (Safari before 15.4), `work` just runs.
 */
export function withTabLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks?.request) return work()
  return locks.request(name, work)
}
