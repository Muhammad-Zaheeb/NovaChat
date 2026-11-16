import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Info,
  RotateCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { chatApi, errorMessage } from '../../api'
import { displayName, lastSeenText } from '../../lib'
import { useAuth } from '../../store/auth'
import { conversationTitle, useChat } from '../../store/chat'
import { typingText, useLive } from '../../store/live'
import { toast } from '../../store/toast'
import { TypingDots } from '../ConversationList'
import GroupInfoDialog from '../GroupInfoDialog'
import MessageSearch from '../MessageSearch'
import NotFound from '../NotFound'
import { Avatar, Button, EmptyState, IconButton, Skeleton, cn } from '../ui'
import Composer from './Composer'
import MessageList from './MessageList'

function setMuted(id: number, muted: boolean) {
  return chatApi.mute(id, muted).then(() =>
    useChat.setState((s) => ({
      conversations: { ...s.conversations, [id]: { ...s.conversations[id], muted } },
    })),
  )
}

export default function ConversationView({ id }: { id: number }) {
  const me = useAuth((s) => s.user)!
  const conv = useChat((s) => s.conversations[id])
  const detail = useChat((s) => s.details[id])
  const online = useLive((s) => s.online)
  const lastSeen = useLive((s) => s.lastSeen)
  const typingIds = useLive((s) => s.typing[id])
  const lastId = useChat((s) => s.threads[id]?.items.at(-1)?.id)
  const { openConversation, markRead, listLoaded, setActive } = useChat()
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<'notfound' | 'failed' | null>(null)
  const [retry, setRetry] = useState(0)
  const [info, setInfo] = useState(false)

  useEffect(() => {
    setActive(id)
    return () => setActive(null)
  }, [id, setActive])

  useEffect(() => {
    openConversation(id).catch((e) => {
      const st = axios.isAxiosError(e) ? e.response?.status : undefined
      setError(st && [403, 404, 422].includes(st) ? 'notfound' : 'failed')
    })
  }, [id, openConversation, retry])

  // Mark the newest message read whenever it changes while this conversation is open.
  useEffect(() => {
    if (lastId) void markRead(id).catch(() => {})
  }, [id, lastId, markRead])

  // Coming back to the tab counts as reading what arrived meanwhile.
  useEffect(() => {
    const onVis = () => void markRead(id).catch(() => {})
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [id, markRead])

  if (error === 'notfound' || (listLoaded && !conv))
    return <NotFound message="Conversation not found" conversation />
  if (error === 'failed')
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load this conversation"
        className="flex-1"
        action={
          <Button
            variant="secondary"
            icon={RotateCw}
            onClick={() => {
              setError(null)
              setRetry((n) => n + 1)
            }}
          >
            Try again
          </Button>
        }
      >
        Check your connection, then try again.
      </EmptyState>
    )
  if (!conv)
    return (
      <div
        aria-busy="true"
        aria-label="Loading conversation"
        className="flex flex-1 flex-col"
      >
        <div className="flex h-16 items-center gap-3 border-b border-line bg-surface px-4">
          <Skeleton className="h-9 w-9 !rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    )

  const title = conversationTitle(conv, detail, me.id)
  const other =
    conv.type === 'direct'
      ? detail?.members.find((m) => m.user.id !== me.id)?.user
      : undefined
  const otherOnline = other !== undefined && !!online[other.id]
  const names = Object.fromEntries(
    (detail?.members ?? []).map((m) => [m.user.id, displayName(m.user)]),
  )
  const typing = typingText(typingIds, names)
  const status = typing ? (
    <span className="flex items-center gap-1.5 text-accent-text">
      <TypingDots /> {typing}
    </span>
  ) : conv.type === 'group' ? (
    detail &&
    `${detail.members.length} ${detail.members.length === 1 ? 'member' : 'members'}`
  ) : (
    other &&
    (otherOnline ? (
      <span className="text-success">Online</span>
    ) : (
      lastSeenText(lastSeen[other.id] ?? other.last_seen_at)
    ))
  )

  const toggleMute = () => {
    const next = !conv.muted
    setMuted(id, next)
      .then(() =>
        toast(next ? `Muted ${title}` : `Unmuted ${title}`, 'info', {
          label: 'Undo',
          onClick: () => void setMuted(id, !next).catch(() => {}),
        }),
      )
      .catch((e) => toast(errorMessage(e, 'Could not change mute')))
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 md:px-4">
        <Link
          to="/"
          aria-label="Back to chats"
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 md:hidden"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => conv.type === 'group' && setInfo(true)}
          disabled={conv.type !== 'group'}
          aria-label={conv.type === 'group' ? `${title}, group info` : undefined}
          className={cn(
            'flex min-w-0 items-center gap-3 rounded-md py-1 pr-2 text-left',
            conv.type === 'group' && 'cursor-pointer hover:bg-surface-2 md:-ml-2 md:pl-2',
          )}
        >
          <Avatar
            id={other?.id ?? conv.id}
            name={title}
            size={36}
            group={conv.type === 'group'}
            online={other ? otherOnline : undefined}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg">{title}</span>
            <span className="block truncate text-xs text-muted" aria-live="polite">
              {status}
            </span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            label="Search messages"
            icon={Search}
            active={searching}
            onClick={() => setSearching((v) => !v)}
          />
          <IconButton
            label={conv.muted ? 'Unmute notifications' : 'Mute notifications'}
            icon={conv.muted ? BellOff : Bell}
            active={conv.muted}
            onClick={toggleMute}
          />
          {conv.type === 'group' && (
            <IconButton label="Group info" icon={Info} onClick={() => setInfo(true)} />
          )}
        </div>
      </header>
      {searching && (
        <MessageSearch convId={id} names={names} onClose={() => setSearching(false)} />
      )}
      {info && <GroupInfoDialog convId={id} onClose={() => setInfo(false)} />}
      <MessageList
        convId={id}
        meId={me.id}
        isGroup={conv.type === 'group'}
        names={names}
      />
      <Composer convId={id} title={title} />
    </>
  )
}
