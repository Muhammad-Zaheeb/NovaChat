import type { ReactNode } from 'react'
import { MessagesSquare, ShieldCheck, UserPlus, Zap } from 'lucide-react'

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="flex items-center justify-center rounded-md bg-accent text-accent-fg"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <MessagesSquare size={Math.round(size * 0.55)} />
      </span>
      <span className="text-base font-semibold tracking-tight text-fg">NovaChat</span>
    </span>
  )
}

const points = [
  {
    icon: Zap,
    title: 'Real time',
    text: 'Messages, typing and read receipts arrive instantly.',
  },
  {
    icon: UserPlus,
    title: 'Friends first',
    text: 'Only people you accept can message you.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified accounts',
    text: 'Every account confirms its email address.',
  },
]

/** Split layout: brand panel (large screens) and a focused form column. */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-full bg-bg">
      <aside className="hidden w-[44%] max-w-xl flex-col justify-between border-r border-line bg-surface p-10 lg:flex">
        <Logo />
        <div className="space-y-8">
          <h2 className="max-w-sm text-3xl leading-tight font-semibold tracking-tight text-fg">
            Conversations with the people you choose.
          </h2>
          <ul className="space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-accent-text">
                  <p.icon size={18} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-fg">{p.title}</span>
                  <span className="block text-sm text-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-subtle">
          Real-time chat, built with FastAPI and React.
        </p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm animate-rise-in">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

/** Inline status/error banner used by the auth forms. */
export function FormNotice({
  kind,
  children,
}: {
  kind: 'error' | 'success'
  children: ReactNode
}) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={
        kind === 'error'
          ? 'rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger'
          : 'rounded-md border border-success/30 bg-accent-soft px-3 py-2 text-sm text-fg'
      }
    >
      {children}
    </p>
  )
}
