import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useParams } from 'react-router-dom'
import GroupInfoDialog from '../components/GroupInfoDialog'
import Composer from '../components/Composer'
import MessageList from '../components/MessageList'
import FriendsView from '../components/FriendsView'
import ProfileView from '../components/ProfileView'
import MessageSearch from '../components/MessageSearch'
import Sidebar from '../components/Sidebar'
import NotFound from '../components/NotFound'
import { Avatar, Button } from '../components/ui'
import { chatApi } from '../api'
import { displayName, lastSeenText } from '../lib'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import { typingText, useLive } from '../store/live'
import { startLive } from '../ws/live'
import { useConn } from '../ws/socket'
import { toast } from '../store/toast'

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return (
        localStorage.getItem('theme') ??
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      )
    } catch {
      return 'light'
    }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

function Conversation({ id }: { id: number }) {
  const me = useAuth((s) => s.user)!
  const conv = useChat((s) => s.conversations[id])
  const detail = useChat((s) => s.details[id])
  const online = useLive((s) => s.online)
  const lastSeen = useLive((s) => s.lastSeen)
  const [searching, setSearching] = useState(false)
  const typingIds = useLive((s) => s.typing[id])
  const lastId = useChat((s) => s.threads[id]?.items.at(-1)?.id)
  const { openConversation, markRead, listLoaded, setActive } = useChat()
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
    return <NotFound message="Conversation not found" />
  if (error === 'failed')
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p>Could not load this conversation.</p>
        <Button
          onClick={() => {
            setError(null)
            setRetry((n) => n + 1)
          }}
        >
          Retry
        </Button>
      </div>
    )
  if (!conv)
    return (
      <div aria-busy="true" className="flex flex-1 animate-pulse flex-col">
        <div className="h-14 border-b border-slate-200 dark:border-slate-800" />
      </div>
    )

  const title = conversationTitle(conv, detail, me.id)
  const otherId =
    conv.type === 'direct'
      ? detail?.members.find((m) => m.user.id !== me.id)?.user.id
      : undefined
  const otherOnline = otherId !== undefined && !!online[otherId]
  const names = Object.fromEntries(
    (detail?.members ?? []).map((m) => [m.user.id, displayName(m.user)]),
  )
  return (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <Link
          to="/"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-xl text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Back to chats"
        >
          ←
        </Link>
        <Avatar name={title} size={36} online={otherOnline} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{title}</div>
          {typingText(typingIds, names) ? (
            <div className="text-xs text-brand-600 dark:text-indigo-400">
              {typingText(typingIds, names)}
            </div>
          ) : conv.type === 'group' ? (
            detail && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {detail.members.length} members
              </div>
            )
          ) : (
            otherId !== undefined && (
              <div
                className={`text-xs ${otherOnline ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {otherOnline
                  ? 'online'
                  : lastSeenText(
                      lastSeen[otherId] ??
                        detail?.members.find((m) => m.user.id === otherId)?.user.last_seen_at,
                    )}
              </div>
            )
          )}
        </div>
        <div className="ml-auto flex items-center">
          <button
            onClick={() => setSearching((v) => !v)}
            aria-label="Search messages"
            className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Search
          </button>
          <button
            onClick={() =>
              void chatApi.mute(id, !conv.muted).then(() =>
                useChat.setState((s) => ({
                  conversations: { ...s.conversations, [id]: { ...s.conversations[id], muted: !conv.muted } },
                })),
              )
            }
            aria-label={conv.muted ? 'Unmute conversation' : 'Mute conversation'}
            className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {conv.muted ? 'Unmute' : 'Mute'}
          </button>
        {conv.type === 'group' && (
          <button
            onClick={() => setInfo(true)}
            aria-label="Group info"
            className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Info
          </button>
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
      <Composer convId={id} />
    </>
  )
}

export default function ChatPage({ view }: { view?: 'friends' | 'profile' }) {
  const { id } = useParams()
  const { theme, toggle } = useTheme()
  const reset = useChat((s) => s.reset)
  useEffect(
    () => () => {
      reset()
      useFriends.getState().reset()
      useLive.getState().reset()
    },
    [reset],
  )
  useEffect(() => startLive(), [])
  const unread = useChat((s) =>
    Object.values(s.conversations).reduce((n, c) => n + c.unread_count, 0),
  )
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) NovaChat` : 'NovaChat'
    return () => {
      document.title = 'NovaChat'
    }
  }, [unread])
  const removedFrom = useChat((s) => s.removedFrom)
  const navigate = useNavigate()
  useEffect(() => {
    if (!removedFrom) return
    toast(`You are no longer a member of ${removedFrom.name}`)
    useChat.getState().clearRemoved()
    navigate('/', { replace: true })
  }, [removedFrom, navigate])
  const down = useConn((s) => s.status === 'down')

  return (
    <div className="flex h-full flex-col">
      {down && (
        <div
          role="status"
          className="bg-amber-500 py-0.5 text-center text-xs font-medium text-slate-900"
        >
          Reconnecting…
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className={`${id || view ? 'hidden md:flex' : 'flex'} h-full w-full md:w-auto`}>
          <Sidebar theme={theme} toggleTheme={toggle} />
        </div>
        <main className={`${id || view ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {view === 'profile' ? (
            <ProfileView />
          ) : view === 'friends' ? (
            <FriendsView />
          ) : id ? (
            Number.isInteger(Number(id)) ? (
              <Conversation id={Number(id)} key={id} />
            ) : (
              <NotFound message="Conversation not found" />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500 dark:text-slate-400">
              Select a conversation or start a new chat
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
