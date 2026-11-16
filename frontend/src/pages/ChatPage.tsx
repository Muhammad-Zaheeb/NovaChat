import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import ConversationView from '../components/chat/ConversationView'
import ConversationList from '../components/ConversationList'
import FriendsView from '../components/FriendsView'
import NotFound from '../components/NotFound'
import ProfileView from '../components/ProfileView'
import QuickSwitcher from '../components/QuickSwitcher'
import { BottomTabs, ConnectionBanner, NavRail } from '../components/shell/Nav'
import { EmptyState, Kbd, modKey } from '../components/ui'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import { useLive } from '../store/live'
import { useOnboarding } from '../store/onboarding'
import { toast } from '../store/toast'
import { startLive } from '../ws/live'

export default function ChatPage({ view }: { view?: 'friends' | 'profile' }) {
  const { id } = useParams()
  const me = useAuth((s) => s.user)!
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
  useEffect(() => useOnboarding.getState().init(me.id), [me.id])
  useEffect(() => {
    void useFriends
      .getState()
      .load()
      .catch(() => {})
  }, [])
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
    toast(`You are no longer a member of ${removedFrom.name}`, 'info')
    useChat.getState().clearRemoved()
    navigate('/', { replace: true })
  }, [removedFrom, navigate])

  // Global shortcut: Cmd/Ctrl+K opens the quick switcher from anywhere.
  const [switcher, setSwitcher] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSwitcher((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const chats = !view
  return (
    <div className="flex h-full flex-col bg-bg">
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        {chats && (
          <div className={`${id ? 'hidden md:flex' : 'flex'} h-full w-full md:w-auto`}>
            <ConversationList onQuickSwitch={() => setSwitcher(true)} />
          </div>
        )}
        <main
          className={`${chats && !id ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col bg-bg`}
        >
          {view === 'profile' ? (
            <ProfileView />
          ) : view === 'friends' ? (
            <FriendsView />
          ) : id ? (
            Number.isInteger(Number(id)) ? (
              <ConversationView id={Number(id)} key={id} />
            ) : (
              <NotFound message="Conversation not found" />
            )
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="Pick up a conversation"
              className="flex-1"
            >
              Choose a chat from the list, or press <Kbd>{modKey}</Kbd> <Kbd>K</Kbd> to
              jump to anyone.
            </EmptyState>
          )}
        </main>
      </div>
      {!id && <BottomTabs />}
      {switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}
    </div>
  )
}
