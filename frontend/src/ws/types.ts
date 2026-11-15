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
  presence: { user_id: number; online: boolean }
  error: { code: string; detail: string }
  pong: Record<string, never>
}

export interface ClientEvents {
  'message.send': { conversation_id: number; content: string; client_id: string }
  'typing.start': { conversation_id: number }
  'typing.stop': { conversation_id: number }
  'message.read': { conversation_id: number; message_id: number }
  ping: Record<string, never>
}
