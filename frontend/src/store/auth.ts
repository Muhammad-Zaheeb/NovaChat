import { create } from 'zustand'
import { authApi, setUnauthorizedHandler, type User } from '../api'

interface AuthState {
  user: User | null
  /** true until the first /auth/me finishes */
  loading: boolean
  restore: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
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
    set({ user: await authApi.me() })
  },
  register: async (username, email, password) => {
    await authApi.register({ username, email, password })
    await authApi.login({ email, password })
    set({ user: await authApi.me() })
  },
  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      set({ user: null })
    }
  },
}))

// A 401 on any non-auth call means the session is gone; ProtectedRoute redirects to /login.
setUnauthorizedHandler(() => useAuth.setState({ user: null }))
