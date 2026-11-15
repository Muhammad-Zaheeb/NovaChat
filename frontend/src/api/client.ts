import axios, { AxiosError } from 'axios'

export const api = axios.create({ baseURL: '/api', withCredentials: true })

// Set by the auth store to avoid a circular import.
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn)

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    const url = err.config?.url ?? ''
    // /auth/me and /auth/login 401s are expected and handled by callers.
    if (err.response?.status === 401 && !url.startsWith('/auth/')) {
      onUnauthorized()
    }
    return Promise.reject(err)
  },
)

/** Extract a readable message from a FastAPI error response. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d[0]?.msg)
      return String(d[0].msg).replace(/^Value error, /, '')
    if (!err.response) return 'Cannot reach the server'
  }
  return fallback
}
