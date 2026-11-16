import { NavLink, useLocation } from 'react-router-dom'
import { MessageSquare, Moon, Settings, Sun, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { useChat } from '../../store/chat'
import { useFriends } from '../../store/friends'
import { useTheme } from '../../store/theme'
import { useConn } from '../../ws/socket'
import { displayName } from '../../lib'
import { Avatar, Badge, IconButton, Spinner, Tooltip, cn } from '../ui'
import { Logo } from '../AuthLayout'

interface Item {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
  badgeLabel?: string
  end?: boolean
}

function useItems(): Item[] {
  const unread = useChat((s) =>
    Object.values(s.conversations).reduce(
      (n, c) => n + (c.muted ? 0 : c.unread_count),
      0,
    ),
  )
  const pending = useFriends((s) => s.incoming.length)
  return [
    {
      to: '/',
      label: 'Chats',
      icon: MessageSquare,
      badge: unread,
      badgeLabel: 'unread messages',
    },
    {
      to: '/friends',
      label: 'Friends',
      icon: Users,
      badge: pending,
      badgeLabel: 'friend requests',
    },
    { to: '/profile', label: 'Settings', icon: Settings },
  ]
}

const count = (n: number) => (n > 99 ? '99+' : n)

/** Chats is "active" for both / and /c/:id. */
const isChats = (path: string) => path === '/' || path.startsWith('/c/')

/** Desktop primary navigation: a slim left rail. */
export function NavRail() {
  const items = useItems()
  const { pathname } = useLocation()
  const me = useAuth((s) => s.user)!
  const theme = useTheme((s) => s.resolved)
  const setPref = useTheme((s) => s.setPref)
  return (
    <nav
      aria-label="Primary"
      className="hidden w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3 md:flex"
    >
      <span className="mb-3">
        <Logo size={32} />
      </span>
      {items.map((it) => (
        <Tooltip key={it.to} label={it.label} side="right">
          <NavLink
            to={it.to}
            aria-label={it.badge ? `${it.label}, ${it.badge} ${it.badgeLabel}` : it.label}
            className={({ isActive }) =>
              cn(
                'relative flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-(--dur-fast)',
                isActive || (it.to === '/' && isChats(pathname))
                  ? 'bg-accent-soft text-accent-text'
                  : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <it.icon size={20} aria-hidden />
            {!!it.badge && (
              <Badge className="absolute -top-0.5 -right-0.5 ring-2 ring-surface">
                {count(it.badge)}
              </Badge>
            )}
          </NavLink>
        </Tooltip>
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        <IconButton
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          icon={theme === 'dark' ? Sun : Moon}
          tooltip="right"
          onClick={() => setPref(theme === 'dark' ? 'light' : 'dark')}
        />
        <Tooltip label={displayName(me)} side="right">
          <NavLink
            to="/profile"
            aria-label={`Your profile, ${displayName(me)}`}
            className="rounded-full"
          >
            <Avatar id={me.id} name={displayName(me)} size={32} />
          </NavLink>
        </Tooltip>
      </div>
    </nav>
  )
}

/** Mobile primary navigation: a bottom tab bar with labels. */
export function BottomTabs() {
  const items = useItems()
  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          aria-label={it.badge ? `${it.label}, ${it.badge} ${it.badgeLabel}` : undefined}
          className={({ isActive }) =>
            cn(
              'relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              isActive ? 'text-accent-text' : 'text-muted',
            )
          }
        >
          <span className="relative">
            <it.icon size={22} aria-hidden />
            {!!it.badge && (
              <Badge className="absolute -top-1.5 left-3.5 ring-2 ring-surface">
                {count(it.badge)}
              </Badge>
            )}
          </span>
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Visible connection status: a quiet bar while the socket reconnects. */
export function ConnectionBanner() {
  const down = useConn((s) => s.status === 'down')
  if (!down) return null
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft py-1.5 text-xs font-medium text-warning animate-fade-in"
    >
      <Spinner size={12} /> Connection lost. Reconnecting…
    </div>
  )
}
