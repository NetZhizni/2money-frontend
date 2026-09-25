// A real (in-memory) IndexedDB for Dexie — the sync layer's behaviour is
// mostly about what ends up in which table, so it's tested against the real
// thing rather than a mock of it.
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// The sync layer checks navigator.onLine before every push and pull; Node
// has a `navigator`, but not that part of it.
vi.stubGlobal('navigator', { onLine: true })
