import type { ReactNode } from 'react'
import { create } from 'zustand'

// Muted, mid-tone hues; all keep white initials above 4.5:1 contrast.
const PALETTE = [
  '#8a5a44',
  '#3f6489',
  '#6a5590',
  '#2f7558',
  '#8c4f68',
  '#56707e',
  '#7f6531',
  '#3c7370',
]

/** Stable colour from a numeric id (falls back to the name for unknown users). */
export function avatarColor(id: number | undefined, name: string) {
  const n = id ?? [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return PALETTE[Math.abs(n) % PALETTE.length]
}

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl'

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive: red confirm button. */
  danger?: boolean
  /** Run before closing; the dialog shows a spinner and stays open on failure. */
  onConfirm?: () => Promise<unknown> | unknown
}

export const useConfirmStore = create<{
  current: (ConfirmOptions & { resolve: (v: boolean) => void }) | null
}>(() => ({ current: null }))

/** Promise-based replacement for window.confirm(). Resolves true when confirmed. */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  useConfirmStore.getState().current?.resolve(false)
  return new Promise((resolve) =>
    useConfirmStore.setState({ current: { ...opts, resolve } }),
  )
}
