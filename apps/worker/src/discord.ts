export class DiscordNotifier {
  constructor(private readonly webhookUrl: string | null) {}

  get enabled(): boolean {
    return Boolean(this.webhookUrl)
  }

  async send(content: string): Promise<boolean> {
    if (!this.webhookUrl) {
      return false
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ content }),
    })

    if (!response.ok) {
      throw new Error(`Discord webhook failed with status ${response.status}`)
    }

    return true
  }
}
