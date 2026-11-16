import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useToasts } from '../../store/toast'
import { cn } from './cn'

const icons = { error: CircleAlert, info: Info, success: CircleCheck }

/** Bottom-centre toasts; errors are announced assertively, the rest politely. */
export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toaster pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-6">
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md border border-line bg-surface py-1.5 pr-1.5 pl-3 text-sm text-fg shadow-lg animate-rise-in"
          >
            <Icon
              size={18}
              aria-hidden
              className={cn(
                'shrink-0',
                t.kind === 'error'
                  ? 'text-danger'
                  : t.kind === 'success'
                    ? 'text-success'
                    : 'text-accent-text',
              )}
            />
            <span className="flex-1 py-1.5">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className="h-8 cursor-pointer rounded-sm px-2 text-sm font-semibold text-accent-text hover:bg-accent-soft pointer-coarse:h-11"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
