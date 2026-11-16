import type { Message } from '../api'

export interface ServerEvents {
  'message.new': Message & { client_id: string | null }
  typing: { conversation_id: number; user_id: number; is_typing: boolean }
  'message.read': { conversation_id: number; user_id: number; message_id: number }
  'conversation.updated': {
    conversation_id: number
    change: 'member_added' | 'member_removed' | 'member_left'
    user_id: number
  }
  'friend.request': { id: number; user: { id: number; username: string } }
  'friend.accepted': { id: number; user: { id: number; username: string } }
  'friend.removed': { user_id: number; request_id?: number }
  presence: { user_id: number; online: boolean; last_seen_at?: string | null }
  'message.updated': Message
  'user.updated': {
    id: number
    username: string
    display_name: string | null
    bio: string | null
  }
  'conversation.muted': { conversation_id: number; muted: boolean }
  error: { code: string; detail: string }
  pong: Record<string, never>
}

export interface ClientEvents {
  'message.send': {
    conversation_id: number
    content: string
    client_id: string
    reply_to_id?: number
  }
  'typing.start': { conversation_id: number }
  'typing.stop': { conversation_id: number }
  'message.read': { conversation_id: number; message_id: number }
  ping: Record<string, never>
}
