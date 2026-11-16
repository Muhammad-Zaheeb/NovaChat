import { api } from './client'
import type {
  Friend,
  FriendRequest,
  Conversation,
  ConversationDetail,
  Message,
  User,
  UserPublic,
} from './types'

export * from './types'
export { errorMessage, setUnauthorizedHandler } from './client'

export const authApi = {
  register: (b: { username: string; email: string; password: string }) =>
    api.post<User>('/auth/register', b).then((r) => r.data),
  login: (b: { email: string; password: string }) => api.post('/auth/login', b),
  verifyEmail: (email: string, code: string) =>
    api.post('/auth/verify-email', { email, code }),
  resendCode: (email: string) => api.post('/auth/resend-code', { email }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  updateProfile: (b: { display_name: string; bio: string }) =>
    api.patch<User>('/users/me', b).then((r) => r.data),
}

export const usersApi = {
  search: (q: string) =>
    api.get<UserPublic[]>('/users/search', { params: { q } }).then((r) => r.data),
  online: (ids: number[]) =>
    api
      .get<{ online: number[] }>('/users/online', { params: { ids: ids.join(',') } })
      .then((r) => r.data.online),
}

export const chatApi = {
  list: () => api.get<Conversation[]>('/conversations').then((r) => r.data),
  get: (id: number) =>
    api.get<ConversationDetail>(`/conversations/${id}`).then((r) => r.data),
  direct: (user_id: number) =>
    api.post<Conversation>('/conversations/direct', { user_id }).then((r) => r.data),
  group: (name: string, member_ids: number[]) =>
    api
      .post<Conversation>('/conversations/group', { name, member_ids })
      .then((r) => r.data),
  addMember: (id: number, user_id: number) =>
    api.post(`/conversations/${id}/members`, { user_id }),
  removeMember: (id: number, user_id: number) =>
    api.delete(`/conversations/${id}/members/${user_id}`),
  /** Newest first. Pass `before` (a message id) to page backwards. */
  messages: (id: number, before?: number, limit = 50) =>
    api
      .get<Message[]>(`/conversations/${id}/messages`, { params: { before, limit } })
      .then((r) => r.data),
  send: (id: number, content: string, reply_to_id?: number) =>
    api
      .post<Message>(`/conversations/${id}/messages`, { content, reply_to_id })
      .then((r) => r.data),
  edit: (id: number, mid: number, content: string) =>
    api
      .patch<Message>(`/conversations/${id}/messages/${mid}`, { content })
      .then((r) => r.data),
  remove: (id: number, mid: number) =>
    api.delete<Message>(`/conversations/${id}/messages/${mid}`).then((r) => r.data),
  react: (id: number, mid: number, emoji: string) =>
    api
      .post<Message>(`/conversations/${id}/messages/${mid}/reactions`, { emoji })
      .then((r) => r.data),
  search: (id: number, q: string) =>
    api
      .get<Message[]>(`/conversations/${id}/messages`, { params: { q, limit: 30 } })
      .then((r) => r.data),
  mute: (id: number, muted: boolean) => api.put(`/conversations/${id}/mute`, { muted }),
  read: (id: number, message_id: number) =>
    api.post<{ last_read_message_id: number | null }>(`/conversations/${id}/read`, {
      message_id,
    }),
}

export const friendsApi = {
  list: () => api.get<Friend[]>('/friends').then((r) => r.data),
  requests: () =>
    api
      .get<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests')
      .then((r) => r.data),
  send: (user_id: number) => api.post<FriendRequest>('/friends/requests', { user_id }),
  accept: (id: number) => api.post(`/friends/requests/${id}/accept`),
  decline: (id: number) => api.post(`/friends/requests/${id}/decline`),
  cancel: (id: number) => api.delete(`/friends/requests/${id}`),
  unfriend: (user_id: number) => api.delete(`/friends/${user_id}`),
}
