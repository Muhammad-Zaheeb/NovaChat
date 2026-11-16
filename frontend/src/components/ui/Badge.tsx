import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'accent' | 'neutral' | 'danger' | 'muted'
const tones: Record<Tone, string> = {
  accent: 'bg-accent text-accent-fg',
  neutral: 'bg-surface-3 text-fg',
  danger: 'bg-danger text-white',
  muted: 'bg-surface-3 text-muted',
}

export function Badge({
  children,
  tone = 'accent',
  className,
  label,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  /** Screen-reader text when the visible content is just a number. */
  label?: string
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums animate-pop-in',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Soft label chip (e.g. "Admin", "Muted"). */
export function Tag({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm border border-line px-1.5 text-[11px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}
