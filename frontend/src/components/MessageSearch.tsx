import { useEffect, useState, type ReactNode } from 'react'
import { chatApi, errorMessage, type Message } from '../api'
import { clockTime, dayLabel } from '../lib'
import { useChat } from '../store/chat'
import { toast } from '../store/toast'
import { Input } from './ui'

function highlight(text: string, q: string): ReactNode {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0 || !q) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-yellow-300 text-black">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** Search within one conversation; clicking a result scrolls to (and flashes) that message. */
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
  const [results, setResults] = useState<Message[] | null>(null)
  const jumpTo = useChat((s) => s.jumpTo)

  useEffect(() => {
    const term = q.trim()
    if (!term) return
    let stale = false
    const t = setTimeout(() => {
      chatApi
        .search(convId, term)
        .then((r) => !stale && setResults(r))
        .catch((e) => toast(errorMessage(e, 'Search failed')))
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, convId])

  return (
    <div className="border-b border-slate-200 p-2 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          aria-label="Search messages"
          placeholder="Search this conversation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <button
          onClick={onClose}
          aria-label="Close search"
          className="h-10 w-10 rounded-lg"
        >
          ✕
        </button>
      </div>
      {q.trim() && results && (
        <ul className="mt-2 max-h-56 overflow-y-auto text-sm">
          {results.length === 0 && (
            <li className="p-2 text-slate-500 dark:text-slate-400">No messages found</li>
          )}
          {results.map((m) => (
            <li key={m.id}>
              <button
                onClick={async () => {
                  if (!(await jumpTo(convId, m.id))) toast('Could not find that message')
                }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {names[m.sender_id] ?? 'Unknown'} · {dayLabel(m.created_at)}{' '}
                  {clockTime(m.created_at)}
                </span>
                <span className="block truncate">{highlight(m.content, q.trim())}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
