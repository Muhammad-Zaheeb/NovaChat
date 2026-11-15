import { create } from 'zustand'
import * as socket from '../ws/socket'
import { chatApi, type Conversation, type ConversationDetail, type Message } from '../api'

const PAGE = 50
const ECHO_TIMEOUT_MS = 10_000

export interface Pending {
  client_id: string
  conversation_id: number
  content: string
  created_at: string
  status: 'sending' | 'failed'
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
  setActive: (id: number | null) => void

  loadConversations: () => Promise<void>
  loadDetail: (id: number) => Promise<void>
  upsertConversation: (c: Conversation) => void
  removeConversation: (id: number) => void
  openConversation: (id: number) => Promise<void>
  loadOlder: (id: number) => Promise<number>
  send: (id: number, content: string) => Promise<void>
  /** Optimistic send over the socket (REST fallback when it is down). */
  sendLive: (id: number, content: string, retryOf?: string) => void
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
  setActive: (id) => set({ activeId: id }),

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
    if (!get().details[id]) await get().loadDetail(id)
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

  sendLive: (id, content, retryOf) => {
    const { dropPending } = get()
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
          },
        ],
      },
    }))
    if (socket.send('message.send', { conversation_id: id, content, client_id })) {
      setTimeout(() => setStatus('failed'), ECHO_TIMEOUT_MS)
    } else {
      chatApi
        .send(id, content)
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
    const visible = document.visibilityState === 'visible'
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
    if (!conv || !last || document.visibilityState !== 'visible') return
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

  reset: () => set({ conversations: {}, details: {}, threads: {}, pending: {}, listLoaded: false, activeId: null }),
}))

/** Display name for a conversation from the viewer's perspective. */
export function conversationTitle(
  c: Conversation,
  detail: ConversationDetail | undefined,
  meId: number,
): string {
  if (c.type === 'group') return c.name ?? 'Group'
  const other = detail?.members.find((m) => m.user.id !== meId)
  return other?.user.username ?? '…'
}
