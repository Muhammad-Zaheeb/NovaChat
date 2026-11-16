import { create } from 'zustand'
import { authApi, setUnauthorizedHandler, type User } from '../api'
import { toast } from './toast'

interface AuthState {
  user: User | null
  /** true until the first /auth/me finishes */
  loading: boolean
  restore: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Re-check /auth/me; handles the cookie having changed in another tab. */
  recheck: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  restore: async () => {
    try {
      set({ user: await authApi.me(), loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  login: async (email, password) => {
    await authApi.login({ email, password })
    const user = await authApi.me()
    set({ user })
    announce({ type: 'login', userId: user.id })
  },
  register: async (username, email, password) => {
    await authApi.register({ username, email, password })
  },
  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      set({ user: null })
      announce({ type: 'logout' })
    }
  },
  recheck: async () => {
    const cur = useAuth.getState().user
    if (!cur) return
    try {
      applyIdentity(await authApi.me())
    } catch (e) {
      // Only a 401 means the session is gone; ignore network errors.
      if ((e as { response?: { status?: number } }).response?.status === 401)
        applyIdentity(null)
    }
  },
}))

type AuthMsg = { type: 'login'; userId: number } | { type: 'logout' }
const KEY = 'novachat-auth'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(KEY) : null

function announce(m: AuthMsg) {
  channel?.postMessage(m)
  try {
    // storage-event fallback (fires in other tabs only)
    localStorage.setItem(KEY, JSON.stringify({ ...m, t: Date.now() }))
  } catch {
    /* storage unavailable */
  }
}

/** Make this tab match the identity the cookie now says we are. */
function applyIdentity(next: User | null) {
  const cur = useAuth.getState().user
  if (next?.id === cur?.id) return
  useAuth.setState({ user: next })
  if (next && cur)
    toast(`You signed in as ${next.username} in another tab. This tab now shows ${next.username}.`, 'info')
  else if (!next && cur) toast('You were signed out in another tab.', 'info')
}

async function onAuthMessage(m: AuthMsg) {
  if (m.type === 'logout') return applyIdentity(null)
  if (useAuth.getState().user?.id === m.userId) return
  try {
    applyIdentity(await authApi.me())
  } catch {
    applyIdentity(null)
  }
}
channel?.addEventListener('message', (e) => void onAuthMessage(e.data as AuthMsg))
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue || channel) return
  try {
    void onAuthMessage(JSON.parse(e.newValue) as AuthMsg)
  } catch {
    /* ignore */
  }
})
window.addEventListener('focus', () => void useAuth.getState().recheck())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void useAuth.getState().recheck()
})

// A 401 on any non-auth call means the session is gone; ProtectedRoute redirects to /login.
setUnauthorizedHandler(() => useAuth.setState({ user: null }))
