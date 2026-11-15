export interface User {
  id: number
  username: string
  email: string
}
export interface UserPublic {
  id: number
  username: string
}
export type ConversationType = 'direct' | 'group'
export type MemberRole = 'admin' | 'member'

export interface Message {
  id: number
  conversation_id: number
  sender_id: number
  content: string
  type: string
  created_at: string
  edited_at: string | null
}
export interface Member {
  user: User
  role: MemberRole
  joined_at: string
}
export interface Conversation {
  id: number
  type: ConversationType
  name: string | null
  created_by: number
  created_at: string
  last_message: Message | null
  unread_count: number
}
export interface ConversationDetail extends Conversation {
  members: Member[]
}
