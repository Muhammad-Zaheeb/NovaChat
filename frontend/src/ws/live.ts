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

  socket.start()
  return () => {
    offs.forEach((f) => f())
    socket.stop()
  }
}
