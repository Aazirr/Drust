export const PROJECT_TIME_ZONE = 'Asia/Manila'

const sharedTimeOptions: Intl.DateTimeFormatOptions = {
  timeZone: PROJECT_TIME_ZONE,
}

export function formatProjectTime(
  timestamp: string | null,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
): string {
  if (!timestamp) {
    return fallback
  }

  return new Date(timestamp).toLocaleString('en-US', {
    ...sharedTimeOptions,
    ...options,
  })
}

export function formatProjectShortTime(timestamp: string | null): string {
  return formatProjectTime(timestamp, {
    hour: '2-digit',
    minute: '2-digit',
  }, 'Not yet')
}

export function formatProjectLongTime(timestamp: string | null): string {
  return formatProjectTime(timestamp, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }, 'Not available')
}
