import type { OperationSource, OperationTarget } from '@drust/domain'

export interface BotOperationAlertPayload {
  kind: 'triggered' | 'countdown' | 'completed'
  target: OperationTarget
  source: OperationSource
  startedAt: string
  endsAt: string
  operationId: string
  remainingMinutes?: number
}

export interface BotTeamAlertPayload {
  title: string
  body: string
}

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1000

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class DiscordNotifier {
  constructor(
    private readonly botUrl: string | null,
    private readonly internalToken: string | null,
  ) {}

  get enabled(): boolean {
    return Boolean(this.botUrl && this.internalToken)
  }

  async sendOperationAlert(payload: BotOperationAlertPayload): Promise<boolean> {
    if (!this.botUrl || !this.internalToken) {
      return false
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.botUrl}/internal/alerts/operation`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.internalToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (response.ok) {
          return true
        }

        lastError = new Error(`Discord bot relay failed with status ${response.status}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }

      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
      }
    }

    throw lastError ?? new Error('Discord bot relay failed after all retries.')
  }

  async sendTeamAlert(payload: BotTeamAlertPayload): Promise<boolean> {
    if (!this.botUrl || !this.internalToken) {
      return false
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.botUrl}/internal/alerts/team`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.internalToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (response.ok) {
          return true
        }

        lastError = new Error(`Discord bot team alert relay failed with status ${response.status}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }

      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
      }
    }

    throw lastError ?? new Error('Discord bot team alert relay failed after all retries.')
  }
}
