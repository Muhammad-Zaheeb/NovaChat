import { create } from 'zustand'
import { useAuth } from './auth'
import { useChat } from './chat'
import { useFriends } from './friends'

/** Profile picture URL per user id, fed from every place users show up. */
interface AvatarState {
  urls: Record<number, string | null>
  put: (users: { id: number; avatar_url?: string | null }[]) => void
}

export const useAvatars = create<AvatarState>((set, get) => ({
  urls: {},
  put: (users) => {
    const cur = get().urls
    const next: Record<number, string | null> = {}
    for (const u of users) {
      const v = u.avatar_url ?? null
      if (u.id in cur ? cur[u.id] !== v : v !== null) next[u.id] = v
    }
    if (Object.keys(next).length) set({ urls: { ...cur, ...next } })
  },
}))

/** Resolve an API-relative media path (/files/...) to something the browser can load. */
export const mediaUrl = (u: string) => (u.startsWith('/') ? `/api${u}` : u)

export function startAvatarSync(): () => void {
  const put = useAvatars.getState().put
  const fromChat = () =>
    put(Object.values(useChat.getState().details).flatMap((d) => d.members.map((m) => m.user)))
  const offs = [
    useAuth.subscribe((s) => s.user && put([s.user])),
    useFriends.subscribe((s) => put(s.friends)),
    useChat.subscribe(fromChat),
  ]
  const me = useAuth.getState().user
  if (me) put([me])
  put(useFriends.getState().friends)
  fromChat()
  return () => offs.forEach((o) => o())
}
