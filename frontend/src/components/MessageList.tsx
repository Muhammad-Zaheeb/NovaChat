import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chatApi, errorMessage, REACTIONS, type Message } from '../api'
import { toast } from '../store/toast'
import { clockTime, dayLabel } from '../lib'
import { useChat } from '../store/chat'
import { useLive } from '../store/live'
import Linkify from './Linkify'
import { Spinner } from './ui'

interface Props {
  convId: number
  meId: number
  isGroup: boolean
  names: Record<number, string>
}

const GROUP_GAP_MS = 5 * 60 * 1000
const EDIT_MS = 15 * 60 * 1000

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-7 w-7 rounded-full text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  )
}

export default function MessageList({ convId, meId, isGroup, names }: Props) {
  const thread = useChat((s) => s.threads[convId])
  const loadOlder = useChat((s) => s.loadOlder)
  const pending = useChat((s) => s.pending[convId])
  const sendLive = useChat((s) => s.sendLive)
  const readMarker = useChat((s) => s.readMarker[convId])
  const jumpTo = useChat((s) => s.jumpTo)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const setEditing = useChat((s) => s.setEditing)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const [picker, setPicker] = useState<number | null>(null)
  const react = (m: Message, emoji: string) =>
    chatApi.react(convId, m.id, emoji).catch((e) => toast(errorMessage(e)))
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
    return (
      <div
        aria-busy="true"
        aria-label="Loading messages"
        className="flex flex-1 animate-pulse flex-col gap-3 overflow-hidden p-4"
      >
        {[60, 40, 70, 30, 55].map((w, i) => (
          <div
            key={i}
            style={{ width: `${w}%` }}
            className={`h-9 rounded-2xl bg-slate-200 dark:bg-slate-800 ${i % 2 ? 'self-end' : ''}`}
          />
        ))}
      </div>
    )
  if (items.length === 0 && !pending?.length)
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500 dark:text-slate-400">
        No messages yet. Say hello 👋
      </div>
    )

  // Latest of my messages that someone else has read, and how many have.
  const others = Object.entries(reads ?? {}).filter(([u]) => Number(u) !== meId)
  const maxRead = Math.max(0, ...others.map(([, id]) => id))
  const seenMsg = items.findLast((m) => m.sender_id === meId && m.id <= maxRead)
  const seenCount = seenMsg ? others.filter(([, id]) => id >= seenMsg.id).length : 0

  const marker = readMarker
  const firstUnreadId =
    marker == null
      ? undefined
      : items.find((x) => x.id > marker && x.sender_id !== meId)?.id

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
        <div
          key={`d${m.id}`}
          className="my-3 text-center text-xs text-slate-500 dark:text-slate-400"
        >
          {dayLabel(m.created_at)}
        </div>,
      )
    if (firstUnreadId === m.id)
      rows.push(
        <div
          key={`u${m.id}`}
          role="separator"
          className="my-3 flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400"
        >
          <span className="h-px flex-1 bg-current opacity-40" />
          New messages
          <span className="h-px flex-1 bg-current opacity-40" />
        </div>,
      )
    const deleted = !!m.deleted
    const canEdit = mine && !deleted && now - new Date(m.created_at).getTime() < EDIT_MS
    rows.push(
      <div
        id={`msg-${m.id}`}
        key={m.id}
        className={`group flex flex-col ${mine ? 'items-end' : 'items-start'} ${sameAsBefore ? 'mt-0.5' : 'mt-3'}`}
      >
        {isGroup && !mine && !sameAsBefore && (
          <span className="mb-0.5 ml-3 text-xs font-medium text-brand-600 dark:text-indigo-400">
            {names[m.sender_id] ?? 'Unknown'}
          </span>
        )}
        <div
          className={`flex max-w-[85%] items-center gap-1 md:max-w-[75%] ${mine ? 'flex-row-reverse' : ''}`}
        >
          <div
            title={new Date(m.created_at).toLocaleString()}
            className={`rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap ${
              deleted
                ? 'border border-slate-300 italic text-slate-500 dark:border-slate-700 dark:text-slate-400'
                : mine
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
            }`}
          >
            {m.reply_to && !deleted && (
              <button
                type="button"
                onClick={() => void jumpTo(convId, m.reply_to!.id)}
                className="mb-1 block w-full rounded border-l-4 border-current/50 bg-black/10 px-2 py-1 text-left text-xs opacity-90"
              >
                <span className="font-semibold">
                  {m.reply_to.sender_id === meId
                    ? 'You'
                    : (names[m.reply_to.sender_id] ?? 'Unknown')}
                </span>
                <span className="block truncate">
                  {m.reply_to.deleted ? 'Message deleted' : m.reply_to.content}
                </span>
              </button>
            )}
            {deleted ? 'Message deleted' : <Linkify text={m.content} />}
            {m.edited_at && !deleted && (
              <span className="ml-1 text-[10px] opacity-70">(edited)</span>
            )}
          </div>
          {!deleted && (
            <div className="flex shrink-0 gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <ActionBtn label="Reply" onClick={() => setReplyTo(m)}>
                ↩
              </ActionBtn>
              <ActionBtn
                label="React"
                onClick={() => setPicker(picker === m.id ? null : m.id)}
              >
                ☺
              </ActionBtn>
              {canEdit && (
                <ActionBtn label="Edit" onClick={() => setEditing(m)}>
                  ✎
                </ActionBtn>
              )}
              {mine && (
                <ActionBtn
                  label="Delete"
                  onClick={() => {
                    if (confirm('Delete this message for everyone?'))
                      void chatApi
                        .remove(convId, m.id)
                        .catch((e) => toast(errorMessage(e)))
                  }}
                >
                  🗑
                </ActionBtn>
              )}
            </div>
          )}
        </div>
        {picker === m.id && (
          <div
            role="menu"
            className="mt-1 flex gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow dark:border-slate-700 dark:bg-slate-900"
          >
            {REACTIONS.map((e) => (
              <button
                key={e}
                aria-label={`React ${e}`}
                className="h-8 w-8 rounded-full text-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setPicker(null)
                  void react(m, e)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {!!m.reactions?.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => void react(m, r.emoji)}
                title={r.user_ids
                  .map((u) => (u === meId ? 'You' : (names[u] ?? 'Someone')))
                  .join(', ')}
                className={`rounded-full border px-2 py-0.5 text-xs ${r.user_ids.includes(meId) ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-300 dark:border-slate-700'}`}
              >
                {r.emoji} {r.user_ids.length}
              </button>
            ))}
          </div>
        )}
        {seenMsg?.id === m.id && (
          <span className="mx-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {isGroup ? `Seen by ${seenCount}` : 'Seen'}
          </span>
        )}
        {!sameAsAfter && (
          <span className="mx-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
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
          className={`max-w-[85%] md:max-w-[75%] rounded-2xl bg-brand-600 px-3 py-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-white ${p.status === 'sending' ? 'opacity-60' : 'ring-2 ring-red-500'}`}
        >
          <Linkify text={p.content} />
        </div>
        <span className="mx-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {p.status === 'sending' ? (
            'Sending…'
          ) : (
            <>
              <span className="text-red-600 dark:text-red-400">Failed to send</span>{' '}
              <button
                className="inline-flex h-8 items-center px-1 font-medium text-brand-600 dark:text-indigo-400 underline"
                onClick={() => sendLive(convId, p.content, p.client_id)}
              >
                Retry
              </button>{' '}
              <button
                className="inline-flex h-8 items-center px-1 underline"
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
        <div className="flex h-8 items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {thread.hasMore ? (
            loadingOlder ? (
              <>
                <Spinner label="Loading older messages" /> Loading older messages…
              </>
            ) : (
              'Scroll up for older messages'
            )
          ) : (
            items.length > 0 && 'You’ve reached the beginning'
          )}
        </div>
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
