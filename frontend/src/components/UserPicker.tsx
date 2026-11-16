import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Search, SearchX } from 'lucide-react'
import { usersApi, type UserPublic } from '../api'
import { displayName } from '../lib'
import { useAuth } from '../store/auth'
import { useFriends } from '../store/friends'
import { useAvatars } from '../store/avatars'
import { Avatar, Input, Skeleton, Tag, cn } from './ui'

function Identity({ u }: { u: UserPublic }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-fg">{displayName(u)}</span>
      <span className="block truncate text-xs text-muted">
        @{u.username}
        {!!u.mutual_friends_count &&
          ` · ${u.mutual_friends_count} mutual friend${u.mutual_friends_count === 1 ? '' : 's'}`}
      </span>
    </span>
  )
}

/** Debounced user search. Calls onPick for each clicked result, or renders a custom action. */
export default function UserPicker({
  onPick,
  selectedIds = [],
  friendsOnly = false,
  renderAction,
  initialQuery = '',
  onSearch,
  placeholder = 'Search by name, username or exact email',
  autoFocus = true,
}: {
  onPick?: (u: UserPublic) => void
  selectedIds?: number[]
  /** Non-friends are shown disabled ("Not a friend yet"). */
  friendsOnly?: boolean
  /** Replace the click-to-pick row with a custom action (e.g. friend buttons). */
  renderAction?: (u: UserPublic) => ReactNode
  initialQuery?: string
  /** Called once a search term of 2+ characters is typed. */
  onSearch?: () => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const friends = useFriends((s) => s.friends)
  const friendIds = friends.map((f) => f.id)
  const me = useAuth((s) => s.user)
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<UserPublic[]>([])
  const [settled, setSettled] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    const mine = ++seq.current // any response from an older query is ignored
    if (term.length < 2) return // the list is derived from `term`, so stale results never show
    onSearch?.()
    const t = setTimeout(async () => {
      setState('loading')
      try {
        const page = await usersApi.search(term)
        if (mine !== seq.current) return
        useAvatars.getState().put(page.items)
        setResults(page.items.filter((u) => u.id !== me?.id))
        setHasMore(page.has_more)
        setSettled(term)
        setState('idle')
      } catch {
        if (mine === seq.current) setState('error')
      }
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, me?.id])

  const loadMore = async () => {
    const mine = seq.current
    setLoadingMore(true)
    try {
      const page = await usersApi.search(settled, results.length)
      if (mine !== seq.current) return
      useAvatars.getState().put(page.items)
      setResults((r) => [...r, ...page.items.filter((u) => u.id !== me?.id)])
      setHasMore(page.has_more)
    } catch {
      setState('error')
    } finally {
      setLoadingMore(false)
    }
  }

  const term = q.trim()
  // Friends-only pickers list your friends straight away; search narrows them and
  // adds non-friends (shown disabled).
  const needle = term.toLowerCase()
  const local = friendsOnly
    ? friends.filter(
        (f) =>
          !needle ||
          f.username.toLowerCase().includes(needle) ||
          (f.display_name ?? '').toLowerCase().includes(needle),
      )
    : []
  const remote = term.length >= 2 && settled === term ? results : []
  const rows = [...local, ...remote.filter((u) => !local.some((l) => l.id === u.id))]
  const searching = term.length >= 2 && settled !== term
  const note = (text: ReactNode, tone: 'muted' | 'danger' = 'muted') => (
    <li
      className={cn(
        'flex items-center gap-2 px-2 py-3 text-sm',
        tone === 'danger' ? 'text-danger' : 'text-muted',
      )}
    >
      {text}
    </li>
  )
  return (
    <div>
      <Input
        aria-label="Search people"
        icon={Search}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoCapitalize="none"
        spellCheck={false}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto" aria-live="polite">
        {rows.length === 0 && term.length < 2
          ? note(
              friendsOnly
                ? 'You have no friends to add yet.'
                : 'Type at least 2 characters to search.',
            )
          : !friendsOnly && term.length < 2
            ? note('Type at least 2 characters to search.')
            : rows.length === 0 && state === 'error' && settled !== term
              ? note('Search failed. Check your connection and try again.', 'danger')
              : rows.length === 0 && searching
                ? [0, 1].map((i) => (
                    <li key={i} className="flex items-center gap-3 p-2" aria-hidden>
                      <Skeleton className="h-9 w-9 !rounded-full" />
                      <Skeleton className="h-3 w-40" />
                    </li>
                  ))
                : rows.length === 0
                  ? note(
                      <>
                        <SearchX size={16} aria-hidden /> Nobody matches “{term}”.
                        Emails must match exactly.
                      </>,
                    )
                  : rows.map((u) => {
                      const blocked = friendsOnly && !friendIds.includes(u.id)
                      const selected = selectedIds.includes(u.id)
                      return renderAction ? (
                        <li
                          key={u.id}
                          className="flex min-h-14 items-center gap-3 rounded-md px-2 py-1.5"
                        >
                          <Avatar id={u.id} name={displayName(u)} size={36} />
                          <Identity u={u} />
                          {renderAction(u)}
                        </li>
                      ) : (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => onPick?.(u)}
                            disabled={blocked}
                            aria-pressed={
                              onPick && selectedIds.length ? selected : undefined
                            }
                            className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                          >
                            <Avatar id={u.id} name={displayName(u)} size={36} />
                            <Identity u={u} />
                            {blocked && <Tag>Not a friend yet</Tag>}
                            {selected && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg animate-pop-in">
                                <Check size={12} aria-label="Selected" />
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
        {hasMore && term.length >= 2 && settled === term && (
          <li className="px-2 py-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full cursor-pointer rounded-md py-2 text-sm font-medium text-accent hover:bg-surface-2 disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
