import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  badge?: ReactNode
}

/** Underline tabs with roving focus (←/→, Home/End). Pair with <TabPanel>. */
export function Tabs<T extends string>({
  idBase,
  value,
  onChange,
  items,
  label,
  className,
}: {
  idBase: string
  value: T
  onChange: (v: T) => void
  items: TabItem<T>[]
  label: string
  className?: string
}) {
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value)
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % items.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    onChange(items[next].value)
    document.getElementById(`${idBase}-tab-${items[next].value}`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn('flex gap-1 border-b border-line', className)}
    >
      {items.map((t) => {
        const sel = t.value === value
        return (
          <button
            key={t.value}
            id={`${idBase}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={sel}
            aria-controls={`${idBase}-panel`}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative -mb-px inline-flex h-11 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-(--dur-fast)',
              sel
                ? 'border-accent text-fg'
                : 'border-transparent text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {t.label}
            {t.badge}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  idBase,
  value,
  children,
  className,
}: {
  idBase: string
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel`}
      aria-labelledby={`${idBase}-tab-${value}`}
      className={className}
    >
      {children}
    </div>
  )
}
