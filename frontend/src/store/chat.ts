import { create } from 'zustand'
import { chatApi, type Conversation, type ConversationDetail, type Message } from '../api'

const PAGE = 50

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
  listLoaded: boolean

  loadConversations: () => Promise<void>
  loadDetail: (id: number) => Promise<void>
  upsertConversation: (c: Conversation) => void
  openConversation: (id: number) => Promise<void>
  loadOlder: (id: number) => Promise<number>
  send: (id: number, content: string) => Promise<void>
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
    if (!conv || !last) return
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

  reset: () => set({ conversations: {}, details: {}, threads: {}, listLoaded: false }),
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
