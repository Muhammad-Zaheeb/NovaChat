import { useAuth } from '../store/auth'
import { useLive } from '../store/live'
import { isAttentive, useChat } from '../store/chat'
import { displayName } from '../lib'
import { notifyMessage } from '../notify'
import { usersApi } from '../api'
import { useFriends } from '../store/friends'
import { startAvatarSync, useAvatars } from '../store/avatars'
import { toast } from '../store/toast'
import * as socket from './socket'

/** Wires socket events into the stores. Returns a cleanup function. */
export function startLive(): () => void {
  const offs: Array<() => void> = [startAvatarSync()]
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
      if (e.last_seen_at) useLive.getState().setLastSeen(e.user_id, e.last_seen_at)
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
      if (me && m.sender_id !== me.id && !isAttentive()) {
        const chat = useChat.getState()
        const c = chat.conversations[m.conversation_id]
        if (!c || c.muted) return
        const sender = chat.details[c.id]?.members.find((x) => x.user.id === m.sender_id)
        const who = sender ? displayName(sender.user) : 'New message'
        notifyMessage(
          c.type === 'group' ? `${who} in ${c.name ?? 'group'}` : who,
          m.content,
          () => {
            window.location.assign(`/c/${c.id}`)
          },
        )
      }
    }),
  )
  offs.push(socket.on('message.updated', (m) => useChat.getState().onMessageUpdated(m)))
  offs.push(
    socket.on('conversation.muted', (e) =>
      useChat.setState((s) => {
        const c = s.conversations[e.conversation_id]
        return c
          ? { conversations: { ...s.conversations, [c.id]: { ...c, muted: e.muted } } }
          : s
      }),
    ),
  )
  offs.push(
    socket.on('user.updated', (u) => {
      const me = useAuth.getState().user
      if (me?.id === u.id)
        useAuth.setState({
          user: { ...me, display_name: u.display_name, bio: u.bio, avatar_url: u.avatar_url },
        })
      useAvatars.getState().put([u])
      useChat.setState((s) => ({
        details: Object.fromEntries(
          Object.entries(s.details).map(([k, d]) => [
            k,
            {
              ...d,
              members: d.members.map((m) =>
                m.user.id === u.id
                  ? {
                      ...m,
                      user: {
                        ...m.user,
                        display_name: u.display_name,
                        bio: u.bio,
                        avatar_url: u.avatar_url,
                      },
                    }
                  : m,
              ),
            },
          ]),
        ),
      }))
      void useFriends
        .getState()
        .load()
        .catch(() => {})
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
  offs.push(
    socket.on('conversation.updated', (e) => {
      const me = useAuth.getState().user
      const chat = useChat.getState()
      if (e.user_id === me?.id && e.change !== 'member_added') {
        const c = chat.conversations[e.conversation_id]
        if (!c) return
        if (chat.activeId === c.id)
          useChat.setState({ removedFrom: { id: c.id, name: c.name ?? 'the group' } })
        else if (e.change === 'member_removed')
          toast(`You were removed from ${c.name ?? 'a group'}`)
        chat.removeConversation(c.id)
        return
      }
      if (e.user_id === me?.id) {
        // I was added: the conversation appears in the sidebar.
        void chat.loadConversations().catch(() => {})
        return
      }
      if (chat.conversations[e.conversation_id])
        void chat.loadDetail(e.conversation_id).catch(() => {})
    }),
  )
  const reloadFriends = () =>
    void useFriends
      .getState()
      .load()
      .catch(() => {})
  offs.push(
    socket.on('friend.request', (e) => {
      reloadFriends()
      toast(`${e.user.username} sent you a friend request`, 'info')
    }),
  )
  offs.push(
    socket.on('friend.accepted', (e) => {
      reloadFriends()
      toast(`${e.user.username} is now your friend`, 'info')
    }),
  )
  offs.push(socket.on('friend.removed', reloadFriends))
  offs.push(socket.onOpen((re) => re && reloadFriends()))
  offs.push(socket.on('error', (e) => toast(e.detail || 'Realtime error')))
  offs.push(socket.onClose(() => toast('Connection lost. Reconnecting…')))
  offs.push(socket.onOpen((re) => re && toast('Back online', 'info')))
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
