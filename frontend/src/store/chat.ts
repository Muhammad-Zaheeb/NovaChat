import { create } from 'zustand'
import * as socket from '../ws/socket'
import { displayName } from '../lib'
import { chatApi, type Conversation, type ConversationDetail, type Message } from '../api'

/** The user can actually see this window: visible AND focused (two windows side by side are both visible). */
export const isAttentive = () =>
  document.visibilityState === 'visible' && document.hasFocus()

const PAGE = 50
const ECHO_TIMEOUT_MS = 10_000

export interface Pending {
  client_id: string
  conversation_id: number
  content: string
  created_at: string
  status: 'sending' | 'failed'
  reply_to_id?: number
}

interface Thread {
  /** ascending by id, deduped */
  items: Message[]
  hasMore: boolean
  loaded: boolean
}

interface ChatState {
  conversations: Record<number, Conversation>
  details: Record<number, ConversationDetail>
  threads: Record<number, Thread>
  pending: Record<number, Pending[]>
  listLoaded: boolean
  /** conversation currently open in the UI */
  activeId: number | null
  /** Composer state for the open conversation. */
  replyTo: Message | null
  editing: Message | null
  setReplyTo: (m: Message | null) => void
  setEditing: (m: Message | null) => void
  /** conversation -> my read marker when I opened it (drives the "New messages" divider) */
  readMarker: Record<number, number | null>
  onMessageUpdated: (m: Message) => void
  jumpTo: (convId: number, messageId: number) => Promise<boolean>
  setActive: (id: number | null) => void
  /** Set when the viewer was removed from the open conversation; ChatPage navigates away. */
  removedFrom: { id: number; name: string } | null
  clearRemoved: () => void

  loadConversations: () => Promise<void>
  loadDetail: (id: number) => Promise<void>
  upsertConversation: (c: Conversation) => void
  removeConversation: (id: number) => void
  openConversation: (id: number) => Promise<void>
  loadOlder: (id: number) => Promise<number>
  send: (id: number, content: string) => Promise<void>
  /** Optimistic send over the socket (REST fallback when it is down). */
  sendLive: (id: number, content: string, retryOf?: string, replyToId?: number) => void
  dropPending: (id: number, clientId: string) => void
  /** Handle a `message.new` event. */
  onMessageEvent: (m: Message & { client_id: string | null }, meId: number) => void
  markRead: (id: number) => Promise<void>
  /** Single entry point for new messages (REST now, WebSocket events in Part 3B). */
  receiveMessage: (m: Message, opts?: { own?: boolean; active?: boolean }) => void
  reset: () => void
}

const merge = (a: Message[], b: Message[]) => {
  const map = new Map<number, Message>()
  for (const m of a) map.set(m.id, m)
  for (const m of b) map.set(m.id, m)
  return [...map.values()].sort((x, y) => x.id - y.id)
}

export const useChat = create<ChatState>((set, get) => ({
  conversations: {},
  details: {},
  threads: {},
  listLoaded: false,
  pending: {},
  activeId: null,
  replyTo: null,
  editing: null,
  readMarker: {},
  setReplyTo: (m) => set({ replyTo: m, editing: null }),
  setEditing: (m) => set({ editing: m, replyTo: null }),
  setActive: (id) =>
    set((s) => {
      const prev = s.activeId
      const readMarker = { ...s.readMarker }
      if (prev && prev !== id) delete readMarker[prev]
      return { activeId: id, replyTo: null, editing: null, readMarker }
    }),
  onMessageUpdated: (m) => {
    set((s) => {
      const t = s.threads[m.conversation_id]
      const c = s.conversations[m.conversation_id]
      return {
        threads: t
          ? { ...s.threads, [m.conversation_id]: { ...t, items: merge(t.items, [m]) } }
          : s.threads,
        conversations:
          c?.last_message?.id === m.id
            ? { ...s.conversations, [c.id]: { ...c, last_message: m } }
            : s.conversations,
        // an edit/delete of the message being replied to or edited ends that state
        replyTo: s.replyTo?.id === m.id ? (m.deleted ? null : m) : s.replyTo,
        editing: s.editing?.id === m.id && m.deleted ? null : s.editing,
      }
    })
  },
  jumpTo: async (convId, messageId) => {
    for (let i = 0; i < 40; i++) {
      const t = get().threads[convId]
      if (t?.items.some((m) => m.id === messageId)) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`msg-${messageId}`)
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          el?.classList.add('flash-highlight')
          setTimeout(() => el?.classList.remove('flash-highlight'), 1800)
        })
        return true
      }
      if (!t?.hasMore || !(await get().loadOlder(convId))) break
    }
    return false
  },
  removedFrom: null,
  clearRemoved: () => set({ removedFrom: null }),

  loadConversations: async () => {
    const list = await chatApi.list()
    set({
      conversations: Object.fromEntries(list.map((c) => [c.id, c])),
      listLoaded: true,
    })
    // The list has no members, which DM titles need.
    await Promise.all(
      list.filter((c) => !get().details[c.id]).map((c) => get().loadDetail(c.id)),
    )
  },

  loadDetail: async (id) => {
    const d = await chatApi.get(id)
    set((s) => ({ details: { ...s.details, [id]: d } }))
  },

  upsertConversation: (c) => {
    set((s) => ({ conversations: { ...s.conversations, [c.id]: c } }))
    if (!get().details[c.id]) void get().loadDetail(c.id)
  },

  removeConversation: (id) =>
    set((s) => {
      const { [id]: _c, ...conversations } = s.conversations
      const { [id]: _d, ...details } = s.details
      const { [id]: _t, ...threads } = s.threads
      const { [id]: _p, ...pending } = s.pending
      return { conversations, details, threads, pending }
    }),

  openConversation: async (id) => {
    await get().loadDetail(id)
    if (!(id in get().readMarker)) {
      const c = get().details[id]
      set((s) => ({
        readMarker: {
          ...s.readMarker,
          [id]: c.unread_count > 0 ? (c.last_read_message_id ?? 0) : null,
        },
      }))
    }
    const msgs = await chatApi.messages(id, undefined, PAGE)
    set((s) => {
      const prev = s.threads[id]?.items ?? []
      return {
        threads: {
          ...s.threads,
          [id]: {
            items: merge(prev, msgs),
            hasMore: s.threads[id]?.loaded ? s.threads[id].hasMore : msgs.length === PAGE,
            loaded: true,
          },
        },
      }
    })
  },

  loadOlder: async (id) => {
    const t = get().threads[id]
    if (!t || !t.hasMore || t.items.length === 0) return 0
    const older = await chatApi.messages(id, t.items[0].id, PAGE)
    set((s) => ({
      threads: {
        ...s.threads,
        [id]: {
          ...s.threads[id],
          items: merge(older, s.threads[id].items),
          hasMore: older.length === PAGE,
        },
      },
    }))
    return older.length
  },

  send: async (id, content) => {
    const m = await chatApi.send(id, content)
    get().receiveMessage(m, { own: true, active: true })
  },

  sendLive: (id, content, retryOf, replyToId) => {
    const { dropPending } = get()
    replyToId ??= retryOf
      ? get().pending[id]?.find((p) => p.client_id === retryOf)?.reply_to_id
      : undefined
    if (retryOf) dropPending(id, retryOf)
    const client_id = crypto.randomUUID()
    const setStatus = (status: Pending['status']) =>
      set((s) => ({
        pending: {
          ...s.pending,
          [id]: (s.pending[id] ?? []).map((p) =>
            p.client_id === client_id && p.status === 'sending' ? { ...p, status } : p,
          ),
        },
      }))
    set((s) => ({
      pending: {
        ...s.pending,
        [id]: [
          ...(s.pending[id] ?? []),
          {
            client_id,
            conversation_id: id,
            content,
            created_at: new Date().toISOString(),
            status: 'sending',
            reply_to_id: replyToId,
          },
        ],
      },
    }))
    if (socket.send('message.send', {
        conversation_id: id,
        content,
        client_id,
        reply_to_id: replyToId,
      })) {
      setTimeout(() => setStatus('failed'), ECHO_TIMEOUT_MS)
    } else {
      chatApi
        .send(id, content, replyToId)
        .then((m) => {
          get().dropPending(id, client_id)
          get().receiveMessage(m, { own: true, active: true })
        })
        .catch(() => setStatus('failed'))
    }
  },

  dropPending: (id, clientId) =>
    set((s) => ({
      pending: {
        ...s.pending,
        [id]: (s.pending[id] ?? []).filter((p) => p.client_id !== clientId),
      },
    })),

  onMessageEvent: (m, meId) => {
    const s = get()
    if (m.client_id) s.dropPending(m.conversation_id, m.client_id)
    if (!s.conversations[m.conversation_id]) {
      // A conversation we have not seen (e.g. someone just added us).
      void s.loadConversations().catch(() => {})
      return
    }
    const visible = isAttentive()
    s.receiveMessage(m, {
      own: m.sender_id === meId,
      active: s.activeId === m.conversation_id && visible,
    })
  },

  receiveMessage: (m, opts = {}) => {
    set((s) => {
      const conv = s.conversations[m.conversation_id]
      const thread = s.threads[m.conversation_id]
      const isNew = !thread?.items.some((x) => x.id === m.id)
      return {
        threads: thread
          ? {
              ...s.threads,
              [m.conversation_id]: { ...thread, items: merge(thread.items, [m]) },
            }
          : s.threads,
        conversations: conv
          ? {
              ...s.conversations,
              [m.conversation_id]: {
                ...conv,
                last_message:
                  !conv.last_message || m.id >= conv.last_message.id
                    ? m
                    : conv.last_message,
                unread_count:
                  isNew && !opts.own && !opts.active
                    ? conv.unread_count + 1
                    : conv.unread_count,
              },
            }
          : s.conversations,
      }
    })
  },

  markRead: async (id) => {
    const conv = get().conversations[id]
    const last = get().threads[id]?.items.at(-1)
    if (!conv || !last || !isAttentive()) return
    if (conv.unread_count > 0) {
      set((s) => ({
        conversations: {
          ...s.conversations,
          [id]: { ...s.conversations[id], unread_count: 0 },
        },
      }))
    }
    await chatApi.read(id, last.id)
  },

  reset: () =>
    set({
      conversations: {},
      details: {},
      threads: {},
      pending: {},
      listLoaded: false,
      activeId: null,
      replyTo: null,
      editing: null,
      readMarker: {},
    }),
}))

/** Display name for a conversation from the viewer's perspective. */
export function conversationTitle(
  c: Conversation,
  detail: ConversationDetail | undefined,
  meId: number,
): string {
  if (c.type === 'group') return c.name ?? 'Group'
  const other = detail?.members.find((m) => m.user.id !== meId)
  return other ? displayName(other.user) : '…'
}
