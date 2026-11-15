import { useEffect, useRef, useState } from 'react'
import { usersApi, type UserPublic } from '../api'
import { useAuth } from '../store/auth'
import { Avatar, Input } from './ui'

/** Debounced user search. Calls onPick for each clicked result. */
export default function UserPicker({
  onPick,
  selectedIds = [],
}: {
  onPick: (u: UserPublic) => void
  selectedIds?: number[]
}) {
  const me = useAuth((s) => s.user)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserPublic[]>([])
  const [settled, setSettled] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    const mine = ++seq.current // any response from an older query is ignored
    if (term.length < 2) return // the list is derived from `term`, so stale results never show
    const t = setTimeout(async () => {
      setState('loading')
      try {
        const found = (await usersApi.search(term)).filter((u) => u.id !== me?.id)
        if (mine !== seq.current) return
        setResults(found)
        setSettled(term)
        setState('idle')
      } catch {
        if (mine === seq.current) setState('error')
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, me?.id])

  const term = q.trim()
  const short = term.length < 2
  return (
    <div>
      <Input
        aria-label="Search users"
        autoFocus
        placeholder="Search by username or exact email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {short ? (
          <li className="p-3 text-sm text-slate-500 dark:text-slate-400">
            Type at least 2 characters
          </li>
        ) : state === 'error' && settled !== term ? (
          <li className="p-3 text-sm text-red-600 dark:text-red-400">Search failed</li>
        ) : settled !== term ? (
          <li className="p-3 text-sm text-slate-500 dark:text-slate-400">Searching…</li>
        ) : results.length === 0 ? (
          <li className="p-3 text-sm text-slate-500 dark:text-slate-400">
            No users found
          </li>
        ) : (
          results.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => onPick(u)}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Avatar name={u.username} size={32} />
                <span className="flex-1 text-sm">{u.username}</span>
                {selectedIds.includes(u.id) && (
                  <span className="text-brand-600 dark:text-indigo-400">✓</span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
