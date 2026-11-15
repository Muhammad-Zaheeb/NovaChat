import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import * as socket from './socket'

/** Wires socket events into the stores. Returns a cleanup function. */
export function startLive(): () => void {
  const offs: Array<() => void> = []

  // After a reconnect, anything sent during the gap is missed: refetch it.
  offs.push(
    socket.onOpen((isReconnect) => {
      if (!isReconnect) return
      const { loadConversations, openConversation, activeId } = useChat.getState()
      void loadConversations().catch(() => {})
      if (activeId) void openConversation(activeId).catch(() => {})
    }),
  )

  offs.push(
    socket.on('message.new', (m) => {
      const me = useAuth.getState().user
      if (me) useChat.getState().onMessageEvent(m, me.id)
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
