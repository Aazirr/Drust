import {
  closeActiveOperation,
  createMockSnapshot,
  extendActiveOperation,
  startOperationFromAlarm,
  withDerivedSnapshot,
  type AlarmBinding,
  type AlarmTriggerInput,
  type DashboardSnapshot,
  type OperationCloseInput,
} from '@drust/domain'
import { startTransition, useEffect, useEffectEvent, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_DRUST_API_URL ?? 'http://127.0.0.1:8787'
const SNAPSHOT_CACHE_KEY_PREFIX = 'drust-dashboard-snapshot'
const SNAPSHOT_CACHE_KEY = `${SNAPSHOT_CACHE_KEY_PREFIX}:${__DRUST_WEB_BUILD_ID__}`
const SNAPSHOT_CACHE_LEGACY_KEY = 'drust-dashboard-snapshot'
const SHOULD_USE_SESSION_CACHE = import.meta.env.PROD

type LoadState = 'loading' | 'ready' | 'offline'

type SnapshotCacheEntry = {
  buildId: string
  snapshot: DashboardSnapshot
}

function getCachedSnapshot(): DashboardSnapshot | null {
  if (!SHOULD_USE_SESSION_CACHE || typeof window === 'undefined') {
    return null
  }

  let expiredBindings: AlarmBinding[] | null = null

  const rawSnapshot = window.sessionStorage.getItem(SNAPSHOT_CACHE_KEY)
  if (rawSnapshot) {
    try {
      const parsed = JSON.parse(rawSnapshot) as Partial<SnapshotCacheEntry>
      if (parsed.buildId === __DRUST_WEB_BUILD_ID__ && parsed.snapshot) {
        return withDerivedSnapshot(parsed.snapshot)
      }

      /* Preserve alarm bindings from expired cache so they survive deploys. */
      if (parsed.snapshot?.alarmBindings?.length) {
        expiredBindings = parsed.snapshot.alarmBindings
      }

      window.sessionStorage.removeItem(SNAPSHOT_CACHE_KEY)
    } catch {
      window.sessionStorage.removeItem(SNAPSHOT_CACHE_KEY)
    }
  }

  const legacySnapshot = window.sessionStorage.getItem(SNAPSHOT_CACHE_LEGACY_KEY)
  if (!legacySnapshot) {
    return expiredBindings ? mergeMockWithBindings(expiredBindings) : null
  }

  try {
    const parsed = JSON.parse(legacySnapshot) as DashboardSnapshot
    const nextSnapshot = withDerivedSnapshot(parsed)
    window.sessionStorage.setItem(
      SNAPSHOT_CACHE_KEY,
      JSON.stringify({ buildId: __DRUST_WEB_BUILD_ID__, snapshot: nextSnapshot }),
    )
    window.sessionStorage.removeItem(SNAPSHOT_CACHE_LEGACY_KEY)
    return nextSnapshot
  } catch {
    window.sessionStorage.removeItem(SNAPSHOT_CACHE_LEGACY_KEY)
    return expiredBindings ? mergeMockWithBindings(expiredBindings) : null
  }
}

function mergeMockWithBindings(bindings: AlarmBinding[]): DashboardSnapshot {
  const mock = createMockSnapshot()
  return {
    ...mock,
    alarmBindings: bindings,
  }
}

function storeSnapshot(snapshot: DashboardSnapshot): void {
  if (!SHOULD_USE_SESSION_CACHE || typeof window === 'undefined') {
    return
  }

  const nextSnapshot = withDerivedSnapshot(snapshot)
  window.sessionStorage.setItem(
    SNAPSHOT_CACHE_KEY,
    JSON.stringify({ buildId: __DRUST_WEB_BUILD_ID__, snapshot: nextSnapshot }),
  )
}

async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const response = await fetch(`${API_BASE_URL}/api/snapshot`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Snapshot request failed with status ${response.status}`)
  }

  const snapshot = (await response.json()) as DashboardSnapshot
  return withDerivedSnapshot(snapshot)
}

export function useDashboardState() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(() => {
    if (typeof window === 'undefined') {
      return createMockSnapshot()
    }

    const cachedSnapshot = getCachedSnapshot()
    if (!cachedSnapshot) {
      return createMockSnapshot()
    }

    return cachedSnapshot
  })
  const [state, setState] = useState<LoadState>(() => {
    if (typeof window === 'undefined') {
      return 'loading'
    }

    return getCachedSnapshot() ? 'ready' : 'loading'
  })
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  async function loadSnapshot(): Promise<void> {
    try {
      const nextSnapshot = await fetchSnapshot()
      storeSnapshot(nextSnapshot)

      startTransition(() => {
        setSnapshot(nextSnapshot)
        setState('ready')
        setError(null)
      })
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Snapshot unavailable.'
      startTransition(() => {
        setSnapshot((current) => withDerivedSnapshot(current))
        setState('offline')
        setError(message)
      })
    }
  }

  const syncSnapshot = useEffectEvent(async () => {
    await loadSnapshot()
  })

  useEffect(() => {
    void syncSnapshot()
    const intervalId = window.setInterval(() => {
      void syncSnapshot()
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  async function postJson<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }

    return (await response.json()) as TResponse
  }

  async function triggerAlarm(input: AlarmTriggerInput): Promise<void> {
    try {
      const nextSnapshot = await postJson<AlarmTriggerInput, DashboardSnapshot>(
        '/api/events/smart-alarm',
        input,
      )
      storeSnapshot(nextSnapshot)
      startTransition(() => {
        setSnapshot(withDerivedSnapshot(nextSnapshot))
        setState('ready')
        setError(null)
      })
    } catch {
      startTransition(() => {
        setSnapshot((current) => startOperationFromAlarm(current, input))
        setState('offline')
      })
    }
  }

  async function extendTimer(minutes: number): Promise<void> {
    try {
      const nextSnapshot = await postJson<{ minutes: number }, DashboardSnapshot>(
        '/api/actions/timer-extend',
        { minutes },
      )
      storeSnapshot(nextSnapshot)
      startTransition(() => {
        setSnapshot(withDerivedSnapshot(nextSnapshot))
        setError(null)
      })
    } catch {
      startTransition(() => {
        setSnapshot((current) => extendActiveOperation(current, { minutes }))
      })
    }
  }

  async function closeOperation(input: OperationCloseInput): Promise<void> {
    try {
      const nextSnapshot = await postJson<OperationCloseInput, DashboardSnapshot>(
        '/api/actions/close-operation',
        input,
      )
      storeSnapshot(nextSnapshot)
      startTransition(() => {
        setSnapshot(withDerivedSnapshot(nextSnapshot))
        setError(null)
      })
    } catch {
      startTransition(() => {
        setSnapshot((current) => closeActiveOperation(current, input))
      })
    }
  }

  async function startRustplusPairing(): Promise<void> {
    try {
      const nextSnapshot = await postJson<Record<string, never>, DashboardSnapshot>(
        '/api/rustplus/pairing/start',
        {},
      )
      storeSnapshot(nextSnapshot)
      startTransition(() => {
        setSnapshot(withDerivedSnapshot(nextSnapshot))
        setState('ready')
        setError(null)
      })
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Unable to start Rust+ pairing.'
      startTransition(() => {
        setState('offline')
        setError(message)
      })
    }
  }

  async function startSmartAlarmBinding(target: 'small-oil' | 'large-oil'): Promise<void> {
    try {
      const nextSnapshot = await postJson<{ target: 'small-oil' | 'large-oil' }, DashboardSnapshot>(
        '/api/rustplus/device-binding/start',
        { target },
      )
      storeSnapshot(nextSnapshot)
      startTransition(() => {
        setSnapshot(withDerivedSnapshot(nextSnapshot))
        setState('ready')
        setError(null)
      })
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : 'Unable to start Smart Alarm binding.'
      startTransition(() => {
        setState('offline')
        setError(message)
      })
    }
  }

  async function removeSmartAlarmBinding(target: 'small-oil' | 'large-oil'): Promise<void> {
    const nextSnapshot = await postJson<{ target: 'small-oil' | 'large-oil' }, DashboardSnapshot>(
      '/api/rustplus/device-binding/remove',
      { target },
    )
    storeSnapshot(nextSnapshot)

    startTransition(() => {
      setSnapshot(withDerivedSnapshot(nextSnapshot))
      setState('ready')
      setError(null)
    })
  }

  return {
    snapshot: withDerivedSnapshot(snapshot, new Date(now)),
    state,
    error,
    refresh: loadSnapshot,
    triggerAlarm,
    extendTimer,
    closeOperation,
    startRustplusPairing,
    startSmartAlarmBinding,
    removeSmartAlarmBinding,
  }
}
