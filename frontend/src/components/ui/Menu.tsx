import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './Button'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  hint?: string
}

/**
 * Icon-triggered dropdown menu (WAI-ARIA menu button): Enter/Space/↓ open it
 * and focus the first item, ↑/↓/Home/End move, Esc or Tab closes and returns
 * focus to the trigger, clicking outside closes.
 */
export function Menu({
  label,
  icon,
  items,
  align = 'end',
  side = 'bottom',
  size = 'md',
  triggerClassName,
}: {
  label: string
  icon: LucideIcon
  items: MenuItem[]
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  size?: 'sm' | 'md'
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const itemsEls = () => [
    ...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ]

  useEffect(() => {
    if (!open) return
    itemsEls()[0]?.focus()
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    const els = itemsEls()
    const i = els.indexOf(document.activeElement as HTMLElement)
    let next = -1
    if (e.key === 'ArrowDown') next = (i + 1) % els.length
    else if (e.key === 'ArrowUp') next = (i - 1 + els.length) % els.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = els.length - 1
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      return close()
    } else if (e.key === 'Tab') return close(false)
    if (next >= 0) {
      e.preventDefault()
      els[next].focus()
    }
  }

  return (
    <div ref={wrap} className="relative inline-flex" onKeyDown={open ? onKey : undefined}>
      <IconButton
        ref={trigger}
        label={label}
        icon={icon}
        size={size}
        tooltip={!open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        active={open}
        className={triggerClassName}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute z-40 min-w-44 rounded-md border border-line bg-surface p-1 shadow-md animate-pop-in',
            align === 'end' ? 'right-0' : 'left-0',
            side === 'bottom'
              ? 'top-full mt-1 origin-top'
              : 'bottom-full mb-1 origin-bottom',
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close()
                it.onSelect()
              }}
              className={cn(
                'flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-left text-sm whitespace-nowrap outline-none pointer-coarse:h-11',
                'focus:bg-surface-2 hover:bg-surface-2',
                it.danger ? 'text-danger' : 'text-fg',
              )}
            >
              {it.icon && (
                <it.icon
                  size={16}
                  aria-hidden
                  className={it.danger ? '' : 'text-muted'}
                />
              )}
              <span className="flex-1">{it.label}</span>
              {it.hint && <span className="text-xs text-subtle">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
