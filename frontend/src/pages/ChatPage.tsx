import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Composer from '../components/Composer'
import MessageList from '../components/MessageList'
import Sidebar from '../components/Sidebar'
import { Avatar } from '../components/ui'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
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
  const lastId = useChat((s) => s.threads[id]?.items.at(-1)?.id)
  const { openConversation, markRead, listLoaded, setActive } = useChat()
  const [error, setError] = useState(false)

  useEffect(() => {
    setActive(id)
    return () => setActive(null)
  }, [id, setActive])

  useEffect(() => {
    openConversation(id).catch(() => setError(true))
  }, [id, openConversation])

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

  if (error || (listLoaded && !conv))
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        Conversation not found
      </div>
    )
  if (!conv)
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        Loading…
      </div>
    )

  const title = conversationTitle(conv, detail, me.id)
  const names = Object.fromEntries(
    (detail?.members ?? []).map((m) => [m.user.id, m.user.username]),
  )
  return (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Link to="/" className="text-slate-500 md:hidden" aria-label="Back">
          ←
        </Link>
        <Avatar name={title} size={36} />
        <div>
          <div className="font-semibold">{title}</div>
          {conv.type === 'group' && detail && (
            <div className="text-xs text-slate-500">{detail.members.length} members</div>
          )}
        </div>
      </header>
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
          <Conversation id={Number(id)} key={id} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Select a conversation or start a new chat
          </div>
        )}
      </main>
    </div>
  )
}
