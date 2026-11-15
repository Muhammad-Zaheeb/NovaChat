import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { formatTime } from '../lib'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
import { typingText, useLive } from '../store/live'
import { NewChatDialog, NewGroupDialog } from './NewChatDialogs'
import { Avatar, Button } from './ui'

export default function Sidebar({
  theme,
  toggleTheme,
}: {
  theme: string
  toggleTheme: () => void
}) {
  const me = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const { conversations, details, listLoaded, loadConversations } = useChat()
  const typing = useLive((s) => s.typing)
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
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-slate-50 md:w-80 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between p-4">
        <h1 className="text-xl font-bold text-brand-600">NovaChat</h1>
        <button onClick={toggleTheme} className="text-lg" aria-label="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <Button className="flex-1" onClick={() => setDialog('chat')}>
          New chat
        </Button>
        <Button
          className="flex-1 !bg-slate-200 !text-slate-800 hover:!bg-slate-300 dark:!bg-slate-800 dark:!text-slate-100"
          onClick={() => setDialog('group')}
        >
          New group
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto">
        {failed ? (
          <p className="p-4 text-sm text-red-500">Could not load conversations</p>
        ) : !listLoaded ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No conversations yet. Start a new chat!
          </p>
        ) : (
          sorted.map((c) => {
            const title = conversationTitle(c, details[c.id], me.id)
            const names = Object.fromEntries(
              (details[c.id]?.members ?? []).map((m) => [m.user.id, m.user.username]),
            )
            const typingHint = typingText(typing[c.id], names)
            return (
              <NavLink
                key={c.id}
                to={`/c/${c.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 ${isActive ? 'bg-brand-50 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}`
                }
              >
                <Avatar name={title} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{title}</span>
                    {c.last_message && (
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatTime(c.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${typingHint ? 'text-brand-600 italic' : 'text-slate-500'}`}
                    >
                      {typingHint ||
                        (c.last_message
                          ? (c.last_message.sender_id === me.id ? 'You: ' : '') +
                            c.last_message.content
                          : 'No messages yet')}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </NavLink>
            )
          })
        )}
      </nav>
      <div className="flex items-center gap-3 border-t border-slate-200 p-3 dark:border-slate-800">
        <Avatar name={me.username} size={32} />
        <span className="flex-1 truncate text-sm font-medium">{me.username}</span>
        <button
          onClick={() => void logout()}
          className="text-sm text-slate-500 hover:text-red-500"
        >
          Log out
        </button>
      </div>
      {dialog === 'chat' && <NewChatDialog onClose={() => setDialog(null)} />}
      {dialog === 'group' && <NewGroupDialog onClose={() => setDialog(null)} />}
    </aside>
  )
}
