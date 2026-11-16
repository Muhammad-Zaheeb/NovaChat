import type { ReactNode } from 'react'

/** Title bar for top-level pages (Friends, Settings). */
export default function PageHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:px-6">
      <h1 className="flex-1 text-lg font-semibold tracking-tight">{title}</h1>
      {action}
    </header>
  )
}
