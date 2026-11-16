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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** 72.4 → "1:12" */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One-line text for a message: its text, or a label for attachments (chat list, replies, notifications). */
export function messagePreview(m: {
  content: string
  deleted?: boolean
  attachments?: { kind: string; original_name: string; duration?: number | null }[]
}): string {
  if (m.deleted) return 'Message deleted'
  const a = m.attachments?.[0]
  if (!a) return m.content
  const label =
    a.kind === 'image'
      ? '📷 Photo'
      : a.kind === 'video'
        ? '🎥 Video'
        : a.kind === 'audio' && a.duration != null
          ? `🎤 Voice message (${formatDuration(a.duration)})`
          : `📎 ${a.original_name}`
  const more = (m.attachments?.length ?? 0) > 1 ? ` +${m.attachments!.length - 1}` : ''
  return label + more + (m.content ? ` ${m.content}` : '')
}

export const voiceSupported = () =>
  typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
