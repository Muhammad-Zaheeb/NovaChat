import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import GroupInfoDialog from '../components/GroupInfoDialog'
import Composer from '../components/Composer'
import MessageList from '../components/MessageList'
import Sidebar from '../components/Sidebar'
import NotFound from '../components/NotFound'
import { Avatar, Button } from '../components/ui'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
import { typingText, useLive } from '../store/live'
import { startLive } from '../ws/live'
import { useConn } from '../ws/socket'

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
    return () => document.removeEventListener('visibilitychange', onVis)
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
    (detail?.members ?? []).map((m) => [m.user.id, m.user.username]),
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
            <div className="text-xs text-brand-600">{typingText(typingIds, names)}</div>
          ) : conv.type === 'group' ? (
            detail && (
              <div className="text-xs text-slate-500">
                {detail.members.length} members
              </div>
            )
          ) : (
            otherId !== undefined && (
              <div
                className={`text-xs ${otherOnline ? 'text-green-600' : 'text-slate-500'}`}
              >
                {otherOnline ? 'online' : 'offline'}
              </div>
            )
          )}
        </div>
        {conv.type === 'group' && (
          <button
            onClick={() => setInfo(true)}
            aria-label="Group info"
            className="ml-auto h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Info
          </button>
        )}
      </header>
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

export default function ChatPage() {
  const { id } = useParams()
  const { theme, toggle } = useTheme()
  const reset = useChat((s) => s.reset)
  useEffect(() => reset, [reset])
  useEffect(() => startLive(), [])
  const down = useConn((s) => s.status === 'down')

  return (
    <div className="relative flex h-full">
      {down && (
        <div className="absolute inset-x-0 top-0 z-20 bg-amber-500 py-0.5 text-center text-xs font-medium text-white">
          Reconnecting…
        </div>
      )}
      <div className={`${id ? 'hidden md:flex' : 'flex'} h-full w-full md:w-auto`}>
        <Sidebar theme={theme} toggleTheme={toggle} />
      </div>
      <main className={`${id ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {id ? (
          Number.isInteger(Number(id)) ? (
            <Conversation id={Number(id)} key={id} />
          ) : (
            <NotFound message="Conversation not found" />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Select a conversation or start a new chat
          </div>
        )}
      </main>
    </div>
  )
}
