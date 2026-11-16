import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'theme'
const media =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const resolve = (p: ThemePref) =>
  p === 'system' ? (media?.matches ? 'dark' : 'light') : p

function apply(p: ThemePref) {
  const dark = resolve(p) === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#171614' : '#ffffff')
}

interface ThemeState {
  pref: ThemePref
  resolved: 'light' | 'dark'
  setPref: (p: ThemePref) => void
}

export const useTheme = create<ThemeState>((set) => ({
  pref: read(),
  resolved: resolve(read()),
  setPref: (pref) => {
    try {
      if (pref === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, pref)
    } catch {
      /* storage unavailable */
    }
    apply(pref)
    set({ pref, resolved: resolve(pref) })
  },
}))

apply(useTheme.getState().pref)
media?.addEventListener('change', () => {
  const { pref } = useTheme.getState()
  if (pref !== 'system') return
  apply(pref)
  useTheme.setState({ resolved: resolve(pref) })
})
// Keep tabs in sync when the preference changes elsewhere.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return
  const pref = read()
  apply(pref)
  useTheme.setState({ pref, resolved: resolve(pref) })
})
