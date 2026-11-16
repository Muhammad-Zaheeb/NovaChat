import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check,
  Inbox,
  MessageSquare,
  MoreHorizontal,
  RotateCw,
  Send,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { errorMessage, friendsApi, type UserPublic } from '../api'
import { displayName, lastSeenText } from '../lib'
import { useFriends } from '../store/friends'
import { useLive } from '../store/live'
import { useOnboarding } from '../store/onboarding'
import { toast } from '../store/toast'
import FriendActions from './FriendActions'
import PageHeader from './PageHeader'
import UserPicker from './UserPicker'
import { useMessage } from './useMessage'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Menu,
  Skeleton,
  TabPanel,
  Tabs,
  confirmAction,
} from './ui'

type Tab = 'friends' | 'requests' | 'find'
const TABS: Tab[] = ['friends', 'requests', 'find']

function PersonRow({
  user,
  online,
  sub,
  children,
}: {
  user: UserPublic
  online?: boolean
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <li className="flex min-h-16 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2">
      <Avatar id={user.id} name={displayName(user)} size={40} online={online} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">
          {displayName(user)}
        </span>
        <span className="block truncate text-xs text-muted">
          {sub ?? `@${user.username}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </li>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-1 px-2 text-xs font-semibold tracking-wide text-subtle uppercase">
        {title} <span className="tabular-nums">· {count}</span>
      </h3>
      {children}
    </section>
  )
}

export default function FriendsView() {
  const { friends, incoming, outgoing, loaded, load } = useFriends()
  const online = useLive((s) => s.online)
  const lastSeen = useLive((s) => s.lastSeen)
  const message = useMessage()
  const [params, setParams] = useSearchParams()
  const tab = (
    TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'friends'
  ) as Tab
  const setTab = (t: Tab) =>
    setParams(t === 'friends' ? {} : { tab: t }, { replace: true })
  const [failed, setFailed] = useState(false)
  const markFind = useOnboarding((s) => s.markFind)

  useEffect(() => {
    load().catch(() => setFailed(true))
  }, [load])
  useEffect(() => {
    if (tab === 'find') markFind()
  }, [tab, markFind])

  const act = async (fn: () => Promise<unknown>, fallback: string, ok?: string) => {
    try {
      await fn()
      if (ok) toast(ok, 'success')
    } catch (e) {
      toast(errorMessage(e, fallback))
    }
    await load().catch(() => {})
  }

  const unfriend = (u: UserPublic) =>
    void confirmAction({
      title: `Remove ${displayName(u)} from friends?`,
      body: 'You will no longer be able to message each other until one of you sends a new request. Your chat history stays.',
      confirmLabel: 'Remove friend',
      danger: true,
      onConfirm: () => act(() => friendsApi.unfriend(u.id), 'Could not remove friend'),
    })

  const findCta = (
    <Button icon={UserPlus} onClick={() => setTab('find')}>
      Find people
    </Button>
  )

  let body: ReactNode
  if (failed && !loaded)
    body = (
      <EmptyState
        icon={Users}
        title="Could not load your friends"
        action={
          <Button
            variant="secondary"
            icon={RotateCw}
            onClick={() => {
              setFailed(false)
              load().catch(() => setFailed(true))
            }}
          >
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </EmptyState>
    )
  else if (!loaded && tab !== 'find')
    body = (
      <ul aria-busy="true" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-3">
            <Skeleton className="h-10 w-10 !rounded-full" />
            <Skeleton className="h-3 w-40" />
          </li>
        ))}
      </ul>
    )
  else if (tab === 'friends')
    body =
      friends.length === 0 ? (
        <EmptyState icon={Users} title="No friends yet" action={findCta}>
          Find people by username or email and send them a request. Once they accept, you
          can chat.
        </EmptyState>
      ) : (
        <ul className="space-y-0.5">
          {friends.map((f) => {
            const on = online[f.id] ?? f.online
            return (
              <PersonRow
                key={f.id}
                user={f}
                online={on}
                sub={on ? 'Online' : lastSeenText(lastSeen[f.id] ?? f.last_seen_at)}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={MessageSquare}
                  onClick={() => void message(f.id)}
                >
                  Message
                </Button>
                <Menu
                  label={`More options for ${displayName(f)}`}
                  icon={MoreHorizontal}
                  size="sm"
                  items={[
                    {
                      label: 'Remove friend',
                      icon: UserMinus,
                      danger: true,
                      onSelect: () => unfriend(f),
                    },
                  ]}
                />
              </PersonRow>
            )
          })}
        </ul>
      )
  else if (tab === 'requests')
    body =
      incoming.length + outgoing.length === 0 ? (
        <EmptyState icon={Inbox} title="No pending requests" action={findCta}>
          Requests you receive appear here for you to accept. Requests you send wait here
          until they answer.
        </EmptyState>
      ) : (
        <>
          <Section title="Received" count={incoming.length}>
            {incoming.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted">Nothing waiting for you.</p>
            ) : (
              <ul className="space-y-0.5">
                {incoming.map((r) => (
                  <PersonRow
                    key={r.id}
                    user={r.requester}
                    sub={`@${r.requester.username} wants to be friends`}
                  >
                    <Button
                      size="sm"
                      icon={Check}
                      onClick={() =>
                        void act(
                          () => friendsApi.accept(r.id),
                          'Could not accept',
                          `You and ${displayName(r.requester)} are now friends`,
                        )
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void act(() => friendsApi.decline(r.id), 'Could not decline')
                      }
                    >
                      Decline
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Sent" count={outgoing.length}>
            {outgoing.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted">
                You have no requests waiting.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {outgoing.map((r) => (
                  <PersonRow
                    key={r.id}
                    user={r.addressee}
                    sub={`@${r.addressee.username} · waiting for reply`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      onClick={() =>
                        void act(
                          () => friendsApi.cancel(r.id),
                          'Could not cancel',
                          'Request cancelled',
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Section>
        </>
      )
  else
    body = (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-muted">
          <Send size={16} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
          Search for someone, then send a friend request. You can chat once they accept.
        </p>
        <UserPicker
          initialQuery={params.get('q') ?? ''}
          renderAction={(u) => <FriendActions user={u} />}
        />
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Friends"
        action={
          tab !== 'find' && (
            <Button icon={UserPlus} size="sm" onClick={() => setTab('find')}>
              Add friend
            </Button>
          )
        }
      />
      <div className="shrink-0 bg-surface px-2 md:px-6">
        <Tabs
          idBase="friends"
          label="Friends sections"
          value={tab}
          onChange={setTab}
          items={[
            {
              value: 'friends',
              label: 'Friends',
              badge: friends.length > 0 && (
                <span className="text-xs text-subtle tabular-nums">{friends.length}</span>
              ),
            },
            {
              value: 'requests',
              label: 'Requests',
              badge: incoming.length > 0 && (
                <Badge label={`${incoming.length} new`}>{incoming.length}</Badge>
              ),
            },
            { value: 'find', label: 'Find people' },
          ]}
        />
      </div>
      <TabPanel
        idBase="friends"
        value={tab}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-4 md:px-6"
      >
        <div className="mx-auto max-w-2xl">{body}</div>
      </TabPanel>
    </div>
  )
}
