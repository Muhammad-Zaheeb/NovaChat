import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { formatTime } from '../lib'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import { typingText, useLive } from '../store/live'
import { NewChatDialog, NewGroupDialog } from './NewChatDialogs'
import { Avatar, Button } from './ui'

function SidebarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading conversations">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

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
  const online = useLive((s) => s.online)
  const pendingIn = useFriends((s) => s.incoming.length)
  const loadFriends = useFriends((s) => s.load)
  useEffect(() => {
    void loadFriends().catch(() => {})
  }, [loadFriends])
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
        <h1 className="text-xl font-bold text-brand-600 dark:text-indigo-400">
          NovaChat
        </h1>
        <button
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg hover:bg-slate-200 dark:hover:bg-slate-800"
          aria-label="Toggle theme"
        >
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
      <NavLink
        to="/friends"
        className={({ isActive }) =>
          `mx-2 mb-1 flex min-h-11 items-center justify-between rounded-lg px-2 text-sm font-medium ${isActive ? 'bg-brand-50 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}`
        }
      >
        <span>Friends</span>
        {pendingIn > 0 && (
          <span
            aria-label={`${pendingIn} pending friend requests`}
            className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            {pendingIn}
          </span>
        )}
      </NavLink>
      <nav className="flex-1 overflow-y-auto">
        {failed ? (
          <div className="p-4 text-sm">
            <p className="text-red-600 dark:text-red-400">Could not load conversations</p>
            <button
              onClick={() => {
                setFailed(false)
                loadConversations().catch(() => setFailed(true))
              }}
              className="mt-2 h-10 font-medium text-brand-600 dark:text-indigo-400 underline"
            >
              Retry
            </button>
          </div>
        ) : !listLoaded ? (
          <SidebarSkeleton />
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">
            <p className="font-medium">No chats yet</p>
            <p className="mt-1">
              Start one with{' '}
              <button
                onClick={() => setDialog('chat')}
                className="font-medium text-brand-600 dark:text-indigo-400 underline"
              >
                New chat
              </button>
              .
            </p>
          </div>
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
                <Avatar
                  name={title}
                  online={
                    c.type === 'direct' &&
                    !!online[
                      details[c.id]?.members.find((m) => m.user.id !== me.id)?.user.id ??
                        -1
                    ]
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{title}</span>
                    {c.last_message && (
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {formatTime(c.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${typingHint ? 'text-brand-600 dark:text-indigo-400 italic' : 'text-slate-500 dark:text-slate-400'}`}
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
          className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:text-red-600 dark:text-slate-400"
        >
          Log out
        </button>
      </div>
      {dialog === 'chat' && <NewChatDialog onClose={() => setDialog(null)} />}
      {dialog === 'group' && <NewGroupDialog onClose={() => setDialog(null)} />}
    </aside>
  )
}
