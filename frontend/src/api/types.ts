export interface User {
  id: number
  username: string
  email: string
  display_name?: string | null
  bio?: string | null
  last_seen_at?: string | null
}
export interface UserPublic {
  id: number
  username: string
  display_name?: string | null
  bio?: string | null
  last_seen_at?: string | null
  friendship_status?: FriendshipStatus
  mutual_friends_count?: number
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
  deleted?: boolean
  reply_to?: ReplyPreview | null
  reactions?: Reaction[]
}
export interface ReplyPreview {
  id: number
  sender_id: number
  content: string
  deleted: boolean
}
export interface Reaction {
  emoji: string
  user_ids: number[]
}
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
export interface Member {
  user: UserPublic
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
  muted?: boolean
  last_read_message_id?: number | null
}
export interface ConversationDetail extends Conversation {
  members: Member[]
}

export type FriendshipStatus =
  'none' | 'pending_outgoing' | 'pending_incoming' | 'friends'
export interface Friend extends UserPublic {
  online: boolean
}
export interface FriendRequest {
  id: number
  status: string
  created_at: string
  requester: UserPublic
  addressee: UserPublic
}
