import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, friendsApi } from '../api'
import { useFriends } from '../store/friends'
import { toast } from '../store/toast'
import { useLive } from '../store/live'
import FriendActions from './FriendActions'
import { useMessage } from './useMessage'
import UserPicker from './UserPicker'
import { Avatar, Button } from './ui'

type Tab = 'friends' | 'requests' | 'find'
const small = 'h-10 !min-h-0 !px-3'
const ghost = `${small} !bg-slate-200 !text-slate-800 hover:!bg-slate-300 dark:!bg-slate-800 dark:!text-slate-100`

export default function FriendsView() {
  const { friends, incoming, outgoing, loaded, load } = useFriends()
  const online = useLive((s) => s.online)
  const message = useMessage()
  const [tab, setTab] = useState<Tab>('friends')
  const [confirm, setConfirm] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    load().catch(() => setFailed(true))
  }, [load])

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    try {
      await fn()
    } catch (e) {
      toast(errorMessage(e, fallback))
    }
    await load().catch(() => {})
  }

  const tabs: [Tab, string][] = [
    ['friends', `Friends${friends.length ? ` (${friends.length})` : ''}`],
    ['requests', `Requests${incoming.length ? ` (${incoming.length})` : ''}`],
    ['find', 'Find people'],
  ]
  const empty = (t: string) => (
    <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">{t}</p>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <Link
          to="/"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-xl text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Back to chats"
        >
          ←
        </Link>
        <h2 className="font-semibold">Friends</h2>
      </header>
      <div role="tablist" className="flex gap-1 border-b border-slate-200 px-4 dark:border-slate-800">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-11 border-b-2 px-3 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-600 dark:text-slate-400'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {failed && !loaded ? (
          <p className="text-sm text-red-600 dark:text-red-400">Could not load friends</p>
        ) : tab === 'friends' ? (
          friends.length === 0 ? (
            empty('No friends yet. Use “Find people” to add some.')
          ) : (
            <ul>
              {friends.map((f) => (
                <li key={f.id} className="flex min-h-14 items-center gap-3 py-1">
                  <Avatar name={f.username} size={36} online={online[f.id] ?? f.online} />
                  <span className="min-w-0 flex-1 truncate text-sm">{f.username}</span>
                  {confirm === f.id ? (
                    <>
                      <Button
                        className={`${small} !bg-red-600 hover:!bg-red-700`}
                        onClick={() => {
                          setConfirm(null)
                          void act(() => friendsApi.unfriend(f.id), 'Could not unfriend')
                        }}
                      >
                        Unfriend
                      </Button>
                      <Button className={ghost} onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button className={small} onClick={() => void message(f.id)}>
                        Message
                      </Button>
                      <button
                        aria-label={`Unfriend ${f.username}`}
                        onClick={() => setConfirm(f.id)}
                        className="h-10 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-slate-800"
                      >
                        Unfriend
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : tab === 'requests' ? (
          <>
            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Incoming
            </h3>
            {incoming.length === 0 && empty('No incoming requests')}
            <ul>
              {incoming.map((r) => (
                <li key={r.id} className="flex min-h-14 items-center gap-3 py-1">
                  <Avatar name={r.requester.username} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {r.requester.username}
                  </span>
                  <Button
                    className={small}
                    onClick={() => void act(() => friendsApi.accept(r.id), 'Could not accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    className={ghost}
                    onClick={() => void act(() => friendsApi.decline(r.id), 'Could not decline')}
                  >
                    Decline
                  </Button>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Outgoing
            </h3>
            {outgoing.length === 0 && empty('No outgoing requests')}
            <ul>
              {outgoing.map((r) => (
                <li key={r.id} className="flex min-h-14 items-center gap-3 py-1">
                  <Avatar name={r.addressee.username} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {r.addressee.username}
                  </span>
                  <Button
                    className={ghost}
                    onClick={() => void act(() => friendsApi.cancel(r.id), 'Could not cancel')}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <UserPicker
            renderAction={(u) => <FriendActions user={u} />}
          />
        )}
      </div>
    </div>
  )
}
