import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  Ban,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from 'lucide-react'
import { chatApi, errorMessage, REACTIONS, type Message } from '../../api'
import { EDIT_MS, clockTime, dayLabel } from '../../lib'
import { useChat } from '../../store/chat'
import { useLive } from '../../store/live'
import { toast } from '../../store/toast'
import Linkify from '../Linkify'
import {
  Avatar,
  Button,
  EmptyState,
  IconButton,
  Menu,
  Skeleton,
  Spinner,
  cn,
  confirmAction,
} from '../ui'

interface Props {
  convId: number
  meId: number
  isGroup: boolean
  names: Record<number, string>
}

const GROUP_GAP_MS = 5 * 60 * 1000

function Divider({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'accent'
}) {
  return (
    <div
      role="separator"
      className={cn(
        'my-4 flex items-center gap-3 text-xs font-medium',
        tone === 'accent' ? 'text-accent-text' : 'text-subtle',
      )}
    >
      <span className="h-px flex-1 bg-current opacity-30" />
      {children}
      <span className="h-px flex-1 bg-current opacity-30" />
    </div>
  )
}

function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'mt-1 flex items-center gap-1 px-1 text-[11px] text-subtle tabular-nums',
        className,
      )}
    >
      {children}
    </span>
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
  // Messages newer than this arrived while the chat was open and get an entrance animation.
  const [baseline, setBaseline] = useState<number | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const items = thread?.items ?? []
  if (thread?.loaded && baseline === null) setBaseline(items.at(-1)?.id ?? 0)

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

  const remove = (m: Message) =>
    void confirmAction({
      title: 'Delete this message?',
      body: 'It will be removed for everyone in this chat. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () =>
        chatApi.remove(convId, m.id).catch((e) => {
          toast(errorMessage(e, 'Could not delete the message'))
          throw e
        }),
    })

  if (!thread?.loaded)
    return (
      <div
        aria-busy="true"
        aria-label="Loading messages"
        className="flex flex-1 flex-col justify-end gap-2 overflow-hidden p-4"
      >
        {[55, 35, 65, 30, 50].map((w, i) => (
          <Skeleton
            key={i}
            style={{ width: `${w}%` }}
            className={cn('h-10 !rounded-lg', i % 2 ? 'self-end' : '')}
          />
        ))}
      </div>
    )
  if (items.length === 0 && !pending?.length)
    return (
      <EmptyState icon={MessageCircle} title="No messages yet" className="flex-1">
        Say hello. Your first message starts the conversation.
      </EmptyState>
    )

  // Latest of my messages that someone else has read, and how many have.
  const others = Object.entries(reads ?? {}).filter(([u]) => Number(u) !== meId)
  const maxRead = Math.max(0, ...others.map(([, id]) => id))
  const seenMsg = items.findLast((m) => m.sender_id === meId && m.id <= maxRead)
  const seenCount = seenMsg ? others.filter(([, id]) => id >= seenMsg.id).length : 0
  const lastMine = items.findLast((m) => m.sender_id === meId && !m.deleted)

  const marker = readMarker
  const firstUnreadId =
    marker == null
      ? undefined
      : items.find((x) => x.id > marker && x.sender_id !== meId)?.id

  const rows: ReactNode[] = []
  items.forEach((m: Message, i) => {
    const before = items[i - 1]
    const after = items[i + 1]
    const newDay =
      !before ||
      new Date(before.created_at).toDateString() !== new Date(m.created_at).toDateString()
    const sameAsBefore =
      !newDay &&
      before.sender_id === m.sender_id &&
      firstUnreadId !== m.id &&
      new Date(m.created_at).getTime() - new Date(before.created_at).getTime() <
        GROUP_GAP_MS
    const sameAsAfter =
      !!after &&
      after.sender_id === m.sender_id &&
      after.id !== firstUnreadId &&
      new Date(after.created_at).toDateString() ===
        new Date(m.created_at).toDateString() &&
      new Date(after.created_at).getTime() - new Date(m.created_at).getTime() <
        GROUP_GAP_MS
    const mine = m.sender_id === meId

    if (newDay) rows.push(<Divider key={`d${m.id}`}>{dayLabel(m.created_at)}</Divider>)
    if (firstUnreadId === m.id)
      rows.push(
        <Divider key={`u${m.id}`} tone="accent">
          New messages
        </Divider>,
      )
    const deleted = !!m.deleted
    const canEdit = mine && !deleted && now - new Date(m.created_at).getTime() < EDIT_MS
    const isNew = baseline !== null && m.id > baseline
    const showAvatar = isGroup && !mine
    const actions = [
      { label: 'Reply', icon: Reply, onSelect: () => setReplyTo(m) },
      { label: 'Add reaction', icon: SmilePlus, onSelect: () => setPicker(m.id) },
      ...(canEdit
        ? [{ label: 'Edit', icon: Pencil, onSelect: () => setEditing(m) }]
        : []),
      ...(mine
        ? [{ label: 'Delete', icon: Trash2, onSelect: () => remove(m), danger: true }]
        : []),
    ]
    rows.push(
      <div
        id={`msg-${m.id}`}
        key={m.id}
        className={cn(
          'group/msg -mx-2 flex gap-2 rounded-md px-2',
          mine ? 'flex-row-reverse' : '',
          sameAsBefore ? 'mt-0.5' : 'mt-3',
          isNew && 'animate-rise-in',
        )}
      >
        {showAvatar && (
          <div className="w-8 shrink-0 self-end">
            {!sameAsAfter && (
              <Avatar id={m.sender_id} name={names[m.sender_id] ?? '?'} size={32} />
            )}
          </div>
        )}
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col',
            mine ? 'items-end' : 'items-start',
          )}
        >
          {isGroup && !mine && !sameAsBefore && (
            <span className="mb-1 px-1 text-xs font-medium text-muted">
              {names[m.sender_id] ?? 'Former member'}
            </span>
          )}
          <div
            className={cn(
              'flex max-w-[88%] items-center gap-1 md:max-w-[72%]',
              mine && 'flex-row-reverse',
            )}
          >
            <div
              title={new Date(m.created_at).toLocaleString()}
              className={cn(
                'min-w-0 rounded-lg px-3 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap md:text-sm',
                deleted
                  ? 'border border-dashed border-line-strong text-subtle italic'
                  : mine
                    ? 'bg-bubble-out text-bubble-out-fg'
                    : 'border border-line bg-bubble-in text-fg shadow-sm',
                mine
                  ? cn(
                      sameAsBefore && 'rounded-tr-[4px]',
                      sameAsAfter && 'rounded-br-[4px]',
                    )
                  : cn(
                      sameAsBefore && 'rounded-tl-[4px]',
                      sameAsAfter && 'rounded-bl-[4px]',
                    ),
              )}
            >
              {m.reply_to && !deleted && (
                <button
                  type="button"
                  onClick={() => void jumpTo(convId, m.reply_to!.id)}
                  className={cn(
                    'mb-1.5 block w-full cursor-pointer rounded-sm border-l-2 px-2 py-1 text-left text-xs',
                    mine
                      ? 'border-white/60 bg-white/15 hover:bg-white/20'
                      : 'border-accent bg-surface-2 hover:bg-surface-3',
                  )}
                >
                  <span className="font-semibold">
                    {m.reply_to.sender_id === meId
                      ? 'You'
                      : (names[m.reply_to.sender_id] ?? 'Former member')}
                  </span>
                  <span className="block truncate opacity-90">
                    {m.reply_to.deleted ? 'Message deleted' : m.reply_to.content}
                  </span>
                </button>
              )}
              {deleted ? (
                <span className="inline-flex items-center gap-1.5">
                  <Ban size={14} aria-hidden /> Message deleted
                </span>
              ) : (
                <Linkify text={m.content} />
              )}
            </div>
            {!deleted && (
              <>
                <div
                  className={cn(
                    'flex shrink-0 items-center rounded-md opacity-0 transition-opacity duration-(--dur-fast) pointer-coarse:hidden',
                    'group-hover/msg:opacity-100 group-focus-within/msg:opacity-100',
                    mine && 'flex-row-reverse',
                  )}
                >
                  {actions.map((a) => (
                    <IconButton
                      key={a.label}
                      label={a.label}
                      icon={a.icon}
                      size="sm"
                      tooltip="top"
                      onClick={a.onSelect}
                      className={
                        a.danger ? 'hover:!bg-danger-soft hover:!text-danger' : ''
                      }
                    />
                  ))}
                </div>
                <div className="hidden pointer-coarse:inline-flex">
                  <Menu
                    label="Message actions"
                    icon={MoreHorizontal}
                    size="sm"
                    align={mine ? 'end' : 'start'}
                    items={actions}
                  />
                </div>
              </>
            )}
          </div>
          {picker === m.id && (
            <div
              role="group"
              aria-label="Choose a reaction"
              onKeyDown={(e) => e.key === 'Escape' && setPicker(null)}
              className="mt-1 flex gap-0.5 rounded-full border border-line bg-surface p-1 shadow-md animate-pop-in"
            >
              {REACTIONS.map((e, idx) => (
                <button
                  key={e}
                  type="button"
                  autoFocus={idx === 0}
                  aria-label={`React with ${e}`}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg transition-transform duration-(--dur-fast) hover:scale-110 hover:bg-surface-2 pointer-coarse:h-11 pointer-coarse:w-11"
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
            <div className={cn('mt-1 flex flex-wrap gap-1', mine && 'justify-end')}>
              {m.reactions.map((r) => {
                const meToo = r.user_ids.includes(meId)
                const who = r.user_ids
                  .map((u) => (u === meId ? 'You' : (names[u] ?? 'Someone')))
                  .join(', ')
                return (
                  <button
                    key={`${r.emoji}${r.user_ids.length}`}
                    type="button"
                    onClick={() => void react(m, r.emoji)}
                    title={who}
                    aria-label={`${r.emoji} ${r.user_ids.length}, ${who}. ${meToo ? 'Remove your reaction' : 'React too'}`}
                    aria-pressed={meToo}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-xs tabular-nums animate-pop-in pointer-coarse:h-9',
                      meToo
                        ? 'border-accent/60 bg-accent-soft text-accent-text'
                        : 'border-line bg-surface text-muted hover:bg-surface-2',
                    )}
                  >
                    <span className="text-sm">{r.emoji}</span> {r.user_ids.length}
                  </button>
                )
              })}
            </div>
          )}
          {!sameAsAfter && (
            <Meta>
              {clockTime(m.created_at)}
              {m.edited_at && !deleted && <span>· Edited</span>}
              {seenMsg?.id === m.id ? (
                <span className="inline-flex items-center gap-0.5 text-accent-text">
                  · <CheckCheck size={13} aria-hidden />{' '}
                  {isGroup ? `Seen by ${seenCount}` : 'Seen'}
                </span>
              ) : (
                lastMine?.id === m.id && (
                  <span className="inline-flex items-center gap-0.5">
                    · <Check size={13} aria-hidden /> Sent
                  </span>
                )
              )}
            </Meta>
          )}
          {sameAsAfter && seenMsg?.id === m.id && (
            <Meta className="text-accent-text">
              <CheckCheck size={13} aria-hidden />{' '}
              {isGroup ? `Seen by ${seenCount}` : 'Seen'}
            </Meta>
          )}
        </div>
      </div>,
    )
  })

  for (const p of pending ?? []) {
    const failed = p.status === 'failed'
    rows.push(
      <div key={p.client_id} className="mt-3 flex flex-col items-end animate-rise-in">
        <div
          className={cn(
            'max-w-[88%] rounded-lg bg-bubble-out px-3 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-bubble-out-fg md:max-w-[72%] md:text-sm',
            failed ? 'ring-2 ring-danger ring-offset-2 ring-offset-bg' : 'opacity-70',
          )}
        >
          <Linkify text={p.content} />
        </div>
        {failed ? (
          <Meta className="text-danger">
            <CircleAlert size={13} aria-hidden /> Not sent
            <Button
              variant="ghost"
              size="sm"
              className="!h-7 !px-2 text-accent-text"
              onClick={() => sendLive(convId, p.content, p.client_id)}
            >
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="!h-7 !px-2"
              onClick={() => useChat.getState().dropPending(convId, p.client_id)}
            >
              Discard
            </Button>
          </Meta>
        ) : (
          <Meta>
            <Clock size={12} aria-hidden /> Sending…
          </Meta>
        )}
      </div>,
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-label="Messages"
        className="flex-1 overflow-y-auto px-3 py-2 md:px-6"
      >
        <div className="flex h-8 items-center justify-center gap-2 text-xs text-subtle">
          {thread.hasMore ? (
            loadingOlder ? (
              <>
                <Spinner size={14} label="Loading older messages" /> Loading older
                messages…
              </>
            ) : (
              'Scroll up for older messages'
            )
          ) : (
            items.length > 0 && 'This is the beginning of the conversation'
          )}
        </div>
        {rows}
      </div>
      {missed > 0 && (
        <button
          type="button"
          onClick={toBottom}
          className="absolute bottom-3 left-1/2 inline-flex h-9 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-medium text-accent-fg shadow-md animate-rise-in hover:bg-accent-hover"
        >
          <ArrowDown size={14} aria-hidden /> {missed} new message
          {missed === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}
