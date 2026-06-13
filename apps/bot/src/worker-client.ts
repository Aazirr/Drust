import type { DashboardSnapshot, OperationCloseInput, StartOperationInput } from '@drust/domain'

interface PairingStatusResponse {
  rustplus: {
    configured: boolean
    smartAlarmsConfigured: boolean
    connectionStatus: string
    pairingMode: string
  }
  discord: {
    webhookConfigured: boolean
    botHealthConfigured: boolean
    botConnected: boolean
  }
}

interface HealthResponse {
  service: string
  status: string
  integrations: DashboardSnapshot['integrations']
}

export class WorkerClient {
  constructor(private readonly baseUrl: string) {}

  async fetchSnapshot(): Promise<DashboardSnapshot> {
    return this.fetchJson<DashboardSnapshot>('/api/snapshot')
  }

  async fetchHealth(): Promise<HealthResponse> {
    return this.fetchJson<HealthResponse>('/health')
  }

  async fetchPairingStatus(): Promise<PairingStatusResponse> {
    return this.fetchJson<PairingStatusResponse>('/api/pairing-status')
  }

  async startOperation(input: StartOperationInput): Promise<DashboardSnapshot> {
    return this.fetchJson<DashboardSnapshot>('/api/actions/start-operation', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async extendTimer(minutes: number): Promise<DashboardSnapshot> {
    return this.fetchJson<DashboardSnapshot>('/api/actions/timer-extend', {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    })
  }

  async closeOperation(input: OperationCloseInput): Promise<DashboardSnapshot> {
    return this.fetchJson<DashboardSnapshot>('/api/actions/close-operation', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  private async fetchJson<T>(pathname: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new Error(`Worker request failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as T
  }
}
