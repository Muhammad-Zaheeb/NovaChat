import { create } from 'zustand'
import {
  friendsApi,
  type Friend,
  type FriendRequest,
  type FriendshipStatus,
} from '../api'

interface FriendsState {
  friends: Friend[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  loaded: boolean
  load: () => Promise<void>
  reset: () => void
}

export const useFriends = create<FriendsState>((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  loaded: false,
  load: async () => {
    const [friends, reqs] = await Promise.all([friendsApi.list(), friendsApi.requests()])
    set({ friends, incoming: reqs.incoming, outgoing: reqs.outgoing, loaded: true })
  },
  reset: () => set({ friends: [], incoming: [], outgoing: [], loaded: false }),
}))

/** Live friendship status of a user, derived from the store (so it follows WS events). */
export function useStatusOf(userId: number): FriendshipStatus {
  return useFriends((s) =>
    s.friends.some((f) => f.id === userId)
      ? 'friends'
      : s.outgoing.some((r) => r.addressee.id === userId)
        ? 'pending_outgoing'
        : s.incoming.some((r) => r.requester.id === userId)
          ? 'pending_incoming'
          : 'none',
  )
}
