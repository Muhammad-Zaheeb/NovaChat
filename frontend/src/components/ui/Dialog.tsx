import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './Button'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog: Esc and the backdrop close it, Tab is trapped inside, focus
 * moves to the first field (or `initialFocus`) and returns to the opener.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  hideClose,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  role?: 'dialog' | 'alertdialog'
  hideClose?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = ref.current!
    if (!root.contains(document.activeElement))
      (
        root.querySelector<HTMLElement>('[data-autofocus]') ??
        root.querySelector<HTMLElement>('input,textarea') ??
        root
      ).focus()
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog reacts.
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== root) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'Tab') {
        const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
        if (!els.length) return e.preventDefault()
        const first = els[0]
        const last = els[els.length - 1]
        if (!root.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const n = Number(document.body.dataset.dialogs ?? 0) + 1
    document.body.dataset.dialogs = String(n)
    return () => {
      const left = Number(document.body.dataset.dialogs ?? 1) - 1
      if (left > 0) document.body.dataset.dialogs = String(left)
      else delete document.body.dataset.dialogs
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-0 animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-t-lg border border-line bg-surface shadow-lg outline-none animate-rise-in sm:rounded-lg sm:animate-pop-in',
          size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md',
          className,
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          {!hideClose && (
            <IconButton
              label="Close"
              icon={X}
              size="sm"
              tooltip={false}
              onClick={onClose}
              className="-mt-1 -mr-2"
            />
          )}
        </div>
        {children && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        )}
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
