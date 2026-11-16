export function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const diff = (now.getTime() - d.getTime()) / 86400000
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

export const displayName = (u: { username: string; display_name?: string | null }) =>
  u.display_name || u.username

/** "last seen 5 min ago" */
export function lastSeenText(iso?: string | null): string {
  if (!iso) return 'offline'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'last seen just now'
  if (mins < 60) return `last seen ${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `last seen ${hrs} h ago`
  if (hrs < 48) return 'last seen yesterday'
  return `last seen ${new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

/** Messages can be edited for this long after sending (matches the backend). */
export const EDIT_MS = 15 * 60 * 1000
