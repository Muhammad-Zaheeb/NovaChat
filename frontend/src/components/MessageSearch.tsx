import { useEffect, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { chatApi, errorMessage, type Message } from '../api'
import { clockTime, dayLabel } from '../lib'
import { useChat } from '../store/chat'
import { toast } from '../store/toast'
import { IconButton, Input, Spinner } from './ui'

function highlight(text: string, q: string): ReactNode {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0 || !q) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-(--highlight) text-fg">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** Search within one conversation; picking a result scrolls to (and flashes) that message. */
export default function MessageSearch({
  convId,
  names,
  onClose,
}: {
  convId: number
  names: Record<number, string>
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ term: string; items: Message[] } | null>(null)
  const jumpTo = useChat((s) => s.jumpTo)

  useEffect(() => {
    const term = q.trim()
    if (!term) return
    let stale = false
    const t = setTimeout(() => {
      chatApi
        .search(convId, term)
        .then((r) => !stale && setResults({ term, items: r }))
        .catch((e) => toast(errorMessage(e, 'Search failed')))
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, convId])

  const term = q.trim()
  const loading = !!term && results?.term !== term
  return (
    <div className="shrink-0 border-b border-line bg-surface px-3 py-2 animate-fade-in md:px-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            autoFocus
            icon={Search}
            aria-label="Search this conversation"
            placeholder="Search this conversation"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            trailing={
              loading ? <Spinner size={14} className="mr-2 text-subtle" /> : undefined
            }
          />
        </div>
        <IconButton label="Close search" icon={X} tooltip={false} onClick={onClose} />
      </div>
      {term && results && (
        <ul className="mt-2 max-h-64 overflow-y-auto" aria-label="Search results">
          {results.items.length === 0 && !loading && (
            <li className="px-2 py-3 text-sm text-muted">No messages match “{term}”.</li>
          )}
          {results.items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={async () => {
                  if (!(await jumpTo(convId, m.id))) toast('Could not find that message')
                }}
                className="block w-full cursor-pointer rounded-md px-2 py-2 text-left hover:bg-surface-2"
              >
                <span className="block text-xs text-subtle tabular-nums">
                  {names[m.sender_id] ?? 'Former member'} · {dayLabel(m.created_at)},{' '}
                  {clockTime(m.created_at)}
                </span>
                <span className="block truncate text-sm text-fg">
                  {highlight(m.content, results.term)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
