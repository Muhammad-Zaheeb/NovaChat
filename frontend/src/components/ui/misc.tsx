import type { KeyboardEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return <div aria-hidden className={cn('skeleton', className)} style={style} />
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center animate-fade-in',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-sm">
        <Icon size={22} aria-hidden />
      </span>
      <div className="max-w-xs space-y-1">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {children && <p className="text-sm text-muted">{children}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Kbd({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-surface-2 px-1 font-sans text-[11px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && (
          <span className="mt-0.5 block text-sm text-muted">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-(--dur)',
          checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-line-strong ring-inset',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-(--dur)',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

/** Segmented radio group (arrow keys move the selection). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: LucideIcon }[]
  label: string
}) {
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value)
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!d) return
    e.preventDefault()
    const next = options[(i + d + options.length) % options.length]
    onChange(next.value)
    ;(
      e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null
    )?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className="inline-flex rounded-md border border-line bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const sel = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={sel}
            data-value={o.value}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-colors duration-(--dur-fast) pointer-coarse:h-10',
              sel ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {o.icon && <o.icon size={15} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
