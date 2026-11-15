import { create } from 'zustand'

const TYPING_TTL_MS = 5000

interface LiveState {
  /** conversation -> user ids currently typing */
  typing: Record<number, number[]>
  setTyping: (conv: number, user: number, on: boolean) => void
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useLive = create<LiveState>((set, get) => ({
  typing: {},
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
