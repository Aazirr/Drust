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

    const response = await fetch(`${this.botUrl}/internal/alerts/operation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.internalToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Discord bot relay failed with status ${response.status}`)
    }

    return true
  }
}
