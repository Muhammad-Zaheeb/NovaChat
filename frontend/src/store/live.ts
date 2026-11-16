import { create } from 'zustand'

const TYPING_TTL_MS = 5000

interface LiveState {
  /** conversation -> user ids currently typing */
  typing: Record<number, number[]>
  /** conversation -> user id -> newest message id they have read (this session) */
  reads: Record<number, Record<number, number>>
  setRead: (conv: number, user: number, messageId: number) => void
  /** user id -> online */
  online: Record<number, boolean>
  setOnline: (m: Record<number, boolean>) => void
  setTyping: (conv: number, user: number, on: boolean) => void
  reset: () => void
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useLive = create<LiveState>((set, get) => ({
  typing: {},
  online: {},
  reset: () => {
    timers.forEach(clearTimeout)
    timers.clear()
    set({ typing: {}, reads: {}, online: {} })
  },
  setOnline: (m) => set((s) => ({ online: { ...s.online, ...m } })),
  reads: {},
  setRead: (conv, user, messageId) =>
    set((s) => ({
      reads: {
        ...s.reads,
        [conv]: {
          ...s.reads[conv],
          [user]: Math.max(s.reads[conv]?.[user] ?? 0, messageId),
        },
      },
    })),
  setTyping: (conv, user, on) => {
    const key = `${conv}:${user}`
    clearTimeout(timers.get(key))
    timers.delete(key)
    const others = (get().typing[conv] ?? []).filter((u) => u !== user)
    if (on) {
      timers.set(
        key,
        setTimeout(() => get().setTyping(conv, user, false), TYPING_TTL_MS),
      )
    }
    set((s) => ({ typing: { ...s.typing, [conv]: on ? [...others, user] : others } }))
  },
}))

/** "alice is typing…" / "2 people are typing…", or '' when nobody is. */
export function typingText(ids: number[] | undefined, names: Record<number, string>) {
  if (!ids?.length) return ''
  if (ids.length === 1) return `${names[ids[0]] ?? 'Someone'} is typing…`
  return `${ids.length} people are typing…`
}
