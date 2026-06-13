import {
  closeActiveOperation,
  createMockSnapshot,
  extendActiveOperation,
  startOperationFromAlarm,
  withDerivedSnapshot,
  type AlarmTriggerInput,
  type DashboardSnapshot,
  type OperationCloseInput,
} from '@drust/domain'
import { startTransition, useEffect, useEffectEvent, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_DRUST_API_URL ?? 'http://127.0.0.1:8787'

type LoadState = 'loading' | 'ready' | 'offline'

async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const response = await fetch(`${API_BASE_URL}/api/snapshot`)
  if (!response.ok) {
    throw new Error(`Snapshot request failed with status ${response.status}`)
  }

  const snapshot = (await response.json()) as DashboardSnapshot
  return withDerivedSnapshot(snapshot)
}

export function useDashboardState() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(() => createMockSnapshot())
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)

  async function loadSnapshot(): Promise<void> {
    try {
      const nextSnapshot = await fetchSnapshot()
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
      startTransition(() => {
        setSnapshot(withDerivedSnapshot(nextSnapshot))
        setError(null)
      })
    } catch {
      startTransition(() => {
        setSnapshot((current) => extendActiveOperation(current, minutes))
      })
    }
  }

  async function closeOperation(input: OperationCloseInput): Promise<void> {
    try {
      const nextSnapshot = await postJson<OperationCloseInput, DashboardSnapshot>(
        '/api/actions/close-operation',
        input,
      )
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

  return {
    snapshot: withDerivedSnapshot(snapshot),
    state,
    error,
    refresh: loadSnapshot,
    triggerAlarm,
    extendTimer,
    closeOperation,
    startRustplusPairing,
    startSmartAlarmBinding,
  }
}
