import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  BellOff,
  MessageSquarePlus,
  Search,
  SquarePen,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Conversation } from '../api'
import { displayName, formatTime, messagePreview } from '../lib'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import { typingText, useLive } from '../store/live'
import { NewChatDialog, NewGroupDialog } from './NewChatDialogs'
import Onboarding from './Onboarding'
import { Avatar, Badge, Button, EmptyState, Kbd, Menu, Skeleton, cn, modKey } from './ui'

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading conversations" className="space-y-1 p-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <Skeleton className="h-10 w-10 !rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TypingDots() {
  return (
    <span className="typing-dots inline-flex items-center gap-0.5" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  )
}

function Row({ c, meId }: { c: Conversation; meId: number }) {
  const detail = useChat((s) => s.details[c.id])
  const typingIds = useLive((s) => s.typing[c.id])
  const online = useLive((s) => s.online)
  const title = conversationTitle(c, detail, meId)
  const other =
    c.type === 'direct'
      ? detail?.members.find((m) => m.user.id !== meId)?.user
      : undefined
  const names = Object.fromEntries(
    (detail?.members ?? []).map((m) => [m.user.id, displayName(m.user)]),
  )
  const typing = typingText(typingIds, names)
  const unread = c.unread_count > 0
  const last = c.last_message
  const preview = last
    ? (last.sender_id === meId
        ? 'You: '
        : c.type === 'group' && names[last.sender_id]
          ? `${names[last.sender_id]}: `
          : '') + messagePreview(last)
    : 'No messages yet'
  return (
    <li>
      <NavLink
        to={`/c/${c.id}`}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors duration-(--dur-fast)',
            isActive ? 'bg-accent-soft' : 'hover:bg-surface-2',
          )
        }
      >
        <Avatar
          id={other?.id ?? c.id}
          name={title}
          group={c.type === 'group'}
          online={other ? !!online[other.id] : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate text-sm text-fg',
                unread ? 'font-semibold' : 'font-medium',
              )}
            >
              {title}
            </span>
            {c.muted && (
              <BellOff size={13} className="shrink-0 text-subtle" aria-label="Muted" />
            )}
            {last && (
              <span
                className={cn(
                  'ml-auto shrink-0 text-xs tabular-nums',
                  unread && !c.muted ? 'font-medium text-accent-text' : 'text-subtle',
                )}
              >
                {formatTime(last.created_at)}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm',
                typing ? 'text-accent-text' : unread ? 'text-fg' : 'text-muted',
              )}
            >
              {typing ? (
                <>
                  <TypingDots /> <span className="truncate">{typing}</span>
                </>
              ) : (
                <span className={cn('truncate', last?.deleted && 'italic')}>
                  {preview}
                </span>
              )}
            </span>
            {unread && (
              <Badge
                tone={c.muted ? 'muted' : 'accent'}
                label={`${c.unread_count} unread`}
              >
                {c.unread_count > 99 ? '99+' : c.unread_count}
              </Badge>
            )}
          </div>
        </div>
      </NavLink>
    </li>
  )
}

export default function ConversationList({
  onQuickSwitch,
}: {
  onQuickSwitch: () => void
}) {
  const me = useAuth((s) => s.user)!
  const conversations = useChat((s) => s.conversations)
  const listLoaded = useChat((s) => s.listLoaded)
  const loadConversations = useChat((s) => s.loadConversations)
  const hasFriends = useFriends((s) => s.friends.length > 0)
  const incoming = useFriends((s) => s.incoming.length)
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'chat' | 'group' | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    loadConversations().catch(() => setFailed(true))
  }, [loadConversations])

  const sorted = useMemo(
    () =>
      Object.values(conversations).sort(
        (a, b) =>
          new Date(b.last_message?.created_at ?? b.created_at).getTime() -
          new Date(a.last_message?.created_at ?? a.created_at).getTime(),
      ),
    [conversations],
  )

  return (
    <section
      aria-label="Conversations"
      className="flex h-full w-full flex-col border-r border-line bg-surface md:w-80 lg:w-[340px]"
    >
      <header className="flex items-center gap-2 px-4 pt-4 pb-3">
        <h1 className="flex-1 text-lg font-semibold tracking-tight">Chats</h1>
        <Menu
          label="New conversation"
          icon={SquarePen}
          items={[
            {
              label: 'New chat',
              icon: MessageSquarePlus,
              onSelect: () => setDialog('chat'),
            },
            { label: 'New group', icon: Users, onSelect: () => setDialog('group') },
            {
              label: 'Add friends',
              icon: UserPlus,
              onSelect: () => navigate('/friends?tab=find'),
            },
          ]}
        />
      </header>
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onQuickSwitch}
          className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-sm text-subtle transition-colors hover:border-line-strong hover:text-muted pointer-coarse:h-11"
        >
          <Search size={16} aria-hidden />
          <span className="flex-1 text-left">Search chats and friends</span>
          <span className="hidden items-center gap-0.5 md:inline-flex">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>
      <Onboarding />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {failed ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="Could not load conversations"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFailed(false)
                  loadConversations().catch(() => setFailed(true))
                }}
              >
                Try again
              </Button>
            }
          >
            Check your connection and try again.
          </EmptyState>
        ) : !listLoaded ? (
          <ListSkeleton />
        ) : sorted.length === 0 ? (
          incoming > 0 ? (
            <EmptyState
              icon={UserPlus}
              title={`You have ${incoming} friend request${incoming === 1 ? '' : 's'}`}
              action={
                <Button
                  size="sm"
                  icon={UserPlus}
                  onClick={() => navigate('/friends?tab=requests')}
                >
                  Review requests
                </Button>
              }
            >
              Accept a request to start chatting.
            </EmptyState>
          ) : hasFriends ? (
            <EmptyState
              icon={MessageSquarePlus}
              title="No conversations yet"
              action={
                <Button
                  size="sm"
                  icon={MessageSquarePlus}
                  onClick={() => setDialog('chat')}
                >
                  Start a chat
                </Button>
              }
            >
              Message a friend or create a group to get going.
            </EmptyState>
          ) : (
            <EmptyState
              icon={UserPlus}
              title="Add friends to start chatting"
              action={
                <Button
                  size="sm"
                  icon={UserPlus}
                  onClick={() => navigate('/friends?tab=find')}
                >
                  Find people
                </Button>
              }
            >
              You can message people once they accept your friend request.
            </EmptyState>
          )
        ) : (
          <ul className="space-y-0.5">
            {sorted.map((c) => (
              <Row key={c.id} c={c} meId={me.id} />
            ))}
          </ul>
        )}
      </div>
      {dialog === 'chat' && <NewChatDialog onClose={() => setDialog(null)} />}
      {dialog === 'group' && <NewGroupDialog onClose={() => setDialog(null)} />}
    </section>
  )
}
