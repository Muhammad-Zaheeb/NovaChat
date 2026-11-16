import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'error' | 'info' | 'success'
  text: string
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  toasts: Toast[]
  dismiss: (id: number) => void
}

let nextId = 1
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Show a toast; identical text already on screen is not duplicated. */
export function toast(text: string, kind: Toast['kind'] = 'error', action?: Toast['action']) {
  const { toasts, dismiss } = useToasts.getState()
  if (toasts.some((t) => t.text === text)) return
  const id = nextId++
  useToasts.setState({ toasts: [...toasts, { id, kind, text, action }].slice(-3) })
  setTimeout(() => dismiss(id), action ? 7000 : 5000)
}
