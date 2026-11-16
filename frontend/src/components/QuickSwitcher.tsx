import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search, UserPlus } from 'lucide-react'
import { displayName } from '../lib'
import { useAuth } from '../store/auth'
import { conversationTitle, useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import { useLive } from '../store/live'
import { useMessage } from './useMessage'
import { Avatar, Dialog, Kbd, cn } from './ui'

interface Entry {
  key: string
  label: string
  sub: string
  avatarId: number
  group?: boolean
  online?: boolean
  run: () => void
}

/** ⌘/Ctrl+K: jump to any chat or friend by name (combobox + listbox). */
export default function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.user)!
  const conversations = useChat((s) => s.conversations)
  const details = useChat((s) => s.details)
  const friends = useFriends((s) => s.friends)
  const online = useLive((s) => s.online)
  const navigate = useNavigate()
  const message = useMessage()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  const entries = useMemo<Entry[]>(() => {
    const convs = Object.values(conversations).sort(
      (a, b) =>
        new Date(b.last_message?.created_at ?? b.created_at).getTime() -
        new Date(a.last_message?.created_at ?? a.created_at).getTime(),
    )
    const dmWith = new Set<number>()
    const out: Entry[] = convs.map((c) => {
      const other =
        c.type === 'direct'
          ? details[c.id]?.members.find((m) => m.user.id !== me.id)?.user
          : undefined
      if (other) dmWith.add(other.id)
      return {
        key: `c${c.id}`,
        label: conversationTitle(c, details[c.id], me.id),
        sub: c.type === 'group' ? 'Group' : 'Chat',
        avatarId: other?.id ?? c.id,
        group: c.type === 'group',
        online: other ? !!online[other.id] : undefined,
        run: () => navigate(`/c/${c.id}`),
      }
    })
    for (const f of friends)
      if (!dmWith.has(f.id))
        out.push({
          key: `f${f.id}`,
          label: displayName(f),
          sub: `Friend · @${f.username}`,
          avatarId: f.id,
          online: online[f.id] ?? f.online,
          run: () => void message(f.id),
        })
    return out
  }, [conversations, details, friends, online, me.id, navigate, message])

  const term = q.trim().toLowerCase()
  const results = term
    ? entries.filter((e) => `${e.label} ${e.sub}`.toLowerCase().includes(term))
    : entries
  const findPeople: Entry = {
    key: 'find',
    label: term ? `Find “${q.trim()}” in Find people` : 'Find people to add',
    sub: 'Friends',
    avatarId: 0,
    run: () =>
      navigate(`/friends?tab=find${term ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
  }
  const all = [...results.slice(0, 30), findPeople]
  const sel = Math.min(active, all.length - 1)

  const choose = (e: Entry) => {
    onClose()
    e.run()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = (sel + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
      setActive(n)
      document.getElementById(`${listId}-${n}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(all[sel])
    }
  }

  return (
    <Dialog title="Jump to" onClose={onClose} size="lg" className="sm:mb-[20vh]">
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
        />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={`${listId}-${sel}`}
          aria-label="Search chats and friends"
          placeholder="Type a name…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
          className="h-11 w-full rounded-md border border-line-strong bg-surface pr-3 pl-9 text-base outline-none focus:border-accent focus:ring-3 focus:ring-accent/20 md:text-sm"
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Results"
        className="mt-2 max-h-[50vh] overflow-y-auto"
      >
        {results.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted" role="presentation">
            No chats or friends match “{q.trim()}”.
          </li>
        )}
        {all.map((e, i) => (
          <li
            key={e.key}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === sel}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(e)}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2',
              i === sel ? 'bg-accent-soft' : '',
              e.key === 'find' && 'mt-1 border-t border-line',
            )}
          >
            {e.key === 'find' ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-accent-text">
                <UserPlus size={16} aria-hidden />
              </span>
            ) : (
              <Avatar
                id={e.avatarId}
                name={e.label}
                size={32}
                group={e.group}
                online={e.online}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">
                {e.label}
              </span>
              <span className="block truncate text-xs text-muted">{e.sub}</span>
            </span>
            {i === sel && (
              <CornerDownLeft size={14} aria-hidden className="text-subtle" />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 hidden items-center gap-3 text-xs text-subtle sm:flex">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> open
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
      </p>
    </Dialog>
  )
}
