import { create } from 'zustand'

/** First-run guidance state, kept per user in localStorage. */
interface OnboardingState {
  userId: number | null
  visitedFind: boolean
  dismissed: boolean
  init: (userId: number) => void
  markFind: () => void
  dismiss: () => void
}

const key = (id: number) => `novachat-onboarding-${id}`

function save(s: OnboardingState) {
  if (s.userId == null) return
  try {
    localStorage.setItem(
      key(s.userId),
      JSON.stringify({ visitedFind: s.visitedFind, dismissed: s.dismissed }),
    )
  } catch {
    /* storage unavailable */
  }
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  userId: null,
  visitedFind: false,
  dismissed: false,
  init: (userId) => {
    let saved = { visitedFind: false, dismissed: false }
    try {
      saved = { ...saved, ...JSON.parse(localStorage.getItem(key(userId)) ?? '{}') }
    } catch {
      /* ignore */
    }
    set({ userId, ...saved })
  },
  markFind: () => {
    if (get().visitedFind) return
    set({ visitedFind: true })
    save(get())
  },
  dismiss: () => {
    set({ dismissed: true })
    save(get())
  },
}))
