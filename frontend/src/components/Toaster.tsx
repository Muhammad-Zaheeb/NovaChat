import { useToasts } from '../store/toast'

export default function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl px-4 py-2 text-sm text-white shadow-lg ${t.kind === 'error' ? 'bg-red-700' : 'bg-slate-800 dark:bg-slate-700'}`}
        >
          <span className="flex-1">{t.text}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
