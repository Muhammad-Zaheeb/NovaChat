import { useLayoutEffect, useRef, useState } from 'react'
import type { Message } from '../api'
import { clockTime, dayLabel } from '../lib'
import { useChat } from '../store/chat'
import { useLive } from '../store/live'

interface Props {
  convId: number
  meId: number
  isGroup: boolean
  names: Record<number, string>
}

const GROUP_GAP_MS = 5 * 60 * 1000

export default function MessageList({ convId, meId, isGroup, names }: Props) {
  const thread = useChat((s) => s.threads[convId])
  const loadOlder = useChat((s) => s.loadOlder)
  const pending = useChat((s) => s.pending[convId])
  const sendLive = useChat((s) => s.sendLive)
  const reads = useLive((s) => s.reads[convId])
  const [missed, setMissed] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const prev = useRef({ convId: -1, count: 0, firstId: 0, height: 0, pend: 0 })
  const [loadingOlder, setLoadingOlder] = useState(false)
  const items = thread?.items ?? []

  // Keep position: stick to bottom for new/own messages, preserve offset when older ones are prepended.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const p = prev.current
    const first = items[0]?.id ?? 0
    if (p.convId !== convId) {
      el.scrollTop = el.scrollHeight
    } else if (first < p.firstId && p.firstId !== 0) {
      el.scrollTop = el.scrollHeight - p.height + el.scrollTop
    } else if (items.length > p.count || (pending?.length ?? 0) > p.pend) {
      const nearBottom = p.height - el.scrollTop - el.clientHeight < 150
      const mine = (pending?.length ?? 0) > p.pend || items.at(-1)?.sender_id === meId
      if (nearBottom || mine) el.scrollTop = el.scrollHeight
      else if (items.length > p.count) {
        const n = items.length - p.count
        queueMicrotask(() => setMissed((c) => c + n))
      }
    }
    prev.current = {
      convId,
      count: items.length,
      firstId: first,
      height: el.scrollHeight,
      pend: pending?.length ?? 0,
    }
  })

  const toBottom = () => {
    const el = ref.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setMissed(0)
  }

  const onScroll = async () => {
    const el = ref.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) setMissed(0)
    if (!el || el.scrollTop > 80 || loadingOlder || !thread?.hasMore) return
    setLoadingOlder(true)
    prev.current.height = el.scrollHeight
    try {
      await loadOlder(convId)
    } finally {
      setLoadingOlder(false)
    }
  }

  if (!thread?.loaded)
    return <div className="flex-1 p-6 text-center text-slate-500">Loading messages…</div>
  if (items.length === 0 && !pending?.length)
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        No messages yet. Say hello 👋
      </div>
    )

  // Latest of my messages that someone else has read, and how many have.
  const others = Object.entries(reads ?? {}).filter(([u]) => Number(u) !== meId)
  const maxRead = Math.max(0, ...others.map(([, id]) => id))
  const seenMsg = items.findLast((m) => m.sender_id === meId && m.id <= maxRead)
  const seenCount = seenMsg ? others.filter(([, id]) => id >= seenMsg.id).length : 0

  const rows: React.ReactNode[] = []
  items.forEach((m: Message, i) => {
    const before = items[i - 1]
    const after = items[i + 1]
    const newDay =
      !before ||
      new Date(before.created_at).toDateString() !== new Date(m.created_at).toDateString()
    const sameAsBefore =
      !newDay &&
      before.sender_id === m.sender_id &&
      new Date(m.created_at).getTime() - new Date(before.created_at).getTime() <
        GROUP_GAP_MS
    const sameAsAfter =
      after &&
      after.sender_id === m.sender_id &&
      new Date(after.created_at).toDateString() ===
        new Date(m.created_at).toDateString() &&
      new Date(after.created_at).getTime() - new Date(m.created_at).getTime() <
        GROUP_GAP_MS
    const mine = m.sender_id === meId

    if (newDay)
      rows.push(
        <div key={`d${m.id}`} className="my-3 text-center text-xs text-slate-500">
          {dayLabel(m.created_at)}
        </div>,
      )
    rows.push(
      <div
        key={m.id}
        className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${sameAsBefore ? 'mt-0.5' : 'mt-3'}`}
      >
        {isGroup && !mine && !sameAsBefore && (
          <span className="mb-0.5 ml-3 text-xs font-medium text-brand-600">
            {names[m.sender_id] ?? 'Unknown'}
          </span>
        )}
        <div
          title={new Date(m.created_at).toLocaleString()}
          className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
            mine
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
          }`}
        >
          {m.content}
        </div>
        {seenMsg?.id === m.id && (
          <span className="mx-2 mt-0.5 text-[11px] text-slate-500">
            {isGroup ? `Seen by ${seenCount}` : 'Seen'}
          </span>
        )}
        {!sameAsAfter && (
          <span className="mx-2 mt-0.5 text-[11px] text-slate-500">
            {clockTime(m.created_at)}
          </span>
        )}
      </div>,
    )
  })

  for (const p of pending ?? []) {
    rows.push(
      <div key={p.client_id} className="mt-3 flex flex-col items-end">
        <div
          className={`max-w-[75%] rounded-2xl bg-brand-600 px-3 py-2 text-sm break-words whitespace-pre-wrap text-white ${p.status === 'sending' ? 'opacity-60' : 'ring-2 ring-red-500'}`}
        >
          {p.content}
        </div>
        <span className="mx-2 mt-0.5 text-[11px] text-slate-500">
          {p.status === 'sending' ? (
            'Sending…'
          ) : (
            <>
              <span className="text-red-500">Failed to send</span>{' '}
              <button
                className="font-medium text-brand-600 underline"
                onClick={() => sendLive(convId, p.content, p.client_id)}
              >
                Retry
              </button>{' '}
              <button
                className="underline"
                onClick={() => useChat.getState().dropPending(convId, p.client_id)}
              >
                Dismiss
              </button>
            </>
          )}
        </span>
      </div>,
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-2">
        {thread.hasMore && (
          <div className="py-2 text-center text-xs text-slate-500">
            {loadingOlder ? 'Loading older messages…' : 'Scroll up for older messages'}
          </div>
        )}
        {rows}
      </div>
      {missed > 0 && (
        <button
          onClick={toBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white shadow-lg"
        >
          New messages ↓
        </button>
      )}
    </div>
  )
}
