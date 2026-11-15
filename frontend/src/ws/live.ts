import { useAuth } from '../store/auth'
import { useLive } from '../store/live'
import { useChat } from '../store/chat'
import { usersApi } from '../api'
import * as socket from './socket'

/** Wires socket events into the stores. Returns a cleanup function. */
export function startLive(): () => void {
  const offs: Array<() => void> = []
  const known = new Set<number>()

  // Ask the server who is online among people in my conversations (all of them
  // after a reconnect, since presence events were missed; otherwise just new ones).
  const syncPresence = (all = false) => {
    const me = useAuth.getState().user?.id
    const ids = new Set<number>()
    for (const d of Object.values(useChat.getState().details))
      for (const m of d.members)
        if (m.user.id !== me && (all || !known.has(m.user.id))) ids.add(m.user.id)
    if (!ids.size) return
    ids.forEach((i) => known.add(i))
    usersApi
      .online([...ids])
      .then((on) =>
        useLive
          .getState()
          .setOnline(Object.fromEntries([...ids].map((i) => [i, on.includes(i)]))),
      )
      .catch(() => ids.forEach((i) => known.delete(i)))
  }
  offs.push(useChat.subscribe((s, p) => s.details !== p.details && syncPresence()))
  offs.push(
    socket.on('presence', (e) => {
      known.add(e.user_id)
      useLive.getState().setOnline({ [e.user_id]: e.online })
    }),
  )

  // After a reconnect, anything sent during the gap is missed: refetch it.
  offs.push(
    socket.onOpen((isReconnect) => {
      if (!isReconnect) return
      const { loadConversations, openConversation, activeId } = useChat.getState()
      void loadConversations()
        .then(() => syncPresence(true))
        .catch(() => {})
      if (activeId) void openConversation(activeId).catch(() => {})
    }),
  )

  offs.push(
    socket.on('message.new', (m) => {
      const me = useAuth.getState().user
      if (me) useChat.getState().onMessageEvent(m, me.id)
    }),
  )
  offs.push(
    socket.on('typing', (e) =>
      useLive.getState().setTyping(e.conversation_id, e.user_id, e.is_typing),
    ),
  )
  // A message from someone means they stopped typing.
  offs.push(
    socket.on('message.new', (m) =>
      useLive.getState().setTyping(m.conversation_id, m.sender_id, false),
    ),
  )
  offs.push(
    socket.on('message.read', (e) => {
      const me = useAuth.getState().user
      if (e.user_id !== me?.id) {
        useLive.getState().setRead(e.conversation_id, e.user_id, e.message_id)
        return
      }
      // I read it in another tab/device: clear the badge here too.
      useChat.setState((s) => {
        const c = s.conversations[e.conversation_id]
        if (!c || !c.last_message || c.last_message.id > e.message_id) return s
        return {
          conversations: { ...s.conversations, [c.id]: { ...c, unread_count: 0 } },
        }
      })
    }),
  )
  // Sends still waiting for an echo cannot be confirmed once the socket drops.
  offs.push(
    socket.onClose(() => {
      useChat.setState((s) => ({
        pending: Object.fromEntries(
          Object.entries(s.pending).map(([k, v]) => [
            k,
            v.map((p) => ({ ...p, status: 'failed' as const })),
          ]),
        ),
      }))
    }),
  )

  socket.start()
  return () => {
    offs.forEach((f) => f())
    socket.stop()
  }
}
