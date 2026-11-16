import type { ReactNode } from 'react'
import { cn } from './cn'

const sides = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
}

/**
 * Hover/focus label for icon-only controls. The control keeps its own
 * aria-label, so the tooltip is visual only (aria-hidden) and is hidden on
 * touch devices, where hover does not exist.
 */
export function Tooltip({
  label,
  side = 'top',
  children,
  className,
}: {
  label: ReactNode
  side?: keyof typeof sides
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute z-50 rounded-sm bg-fg px-2 py-1 text-xs font-medium whitespace-nowrap text-bg opacity-0 shadow-md',
          'transition-opacity duration-(--dur-fast) group-hover/tt:opacity-100 group-hover/tt:delay-300 group-has-[:focus-visible]/tt:opacity-100',
          'pointer-coarse:hidden',
          sides[side],
        )}
      >
        {label}
      </span>
    </span>
  )
}
