import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, UserMinus, UserPlus } from 'lucide-react'
import { chatApi, errorMessage, type UserPublic } from '../api'
import { displayName, lastSeenText } from '../lib'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useLive } from '../store/live'
import { toast } from '../store/toast'
import UserPicker from './UserPicker'
import { Avatar, Button, Dialog, IconButton, Tag, confirmAction } from './ui'

export default function GroupInfoDialog({
  convId,
  onClose,
}: {
  convId: number
  onClose: () => void
}) {
  const me = useAuth((s) => s.user)!
  const navigate = useNavigate()
  const conv = useChat((s) => s.conversations[convId])
  const detail = useChat((s) => s.details[convId])
  const loadDetail = useChat((s) => s.loadDetail)
  const removeConversation = useChat((s) => s.removeConversation)
  const online = useLive((s) => s.online)
  const lastSeen = useLive((s) => s.lastSeen)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Membership changes also arrive live (conversation.updated); refresh on open too.
  useEffect(() => {
    loadDetail(convId).catch(() => setError('Could not refresh members'))
  }, [convId, loadDetail])

  const members = detail?.members ?? []
  const isAdmin = members.some((m) => m.user.id === me.id && m.role === 'admin')
  const name = conv?.name ?? 'this group'

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      return true
    } catch (e) {
      setError(errorMessage(e, fallback))
      // Permissions may have changed under us: show the truth.
      void loadDetail(convId).catch(() => {})
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (u: UserPublic) => {
    if (members.some((m) => m.user.id === u.id))
      return setError(`${displayName(u)} is already a member`)
    if (await run(() => chatApi.addMember(convId, u.id), 'Could not add member')) {
      await loadDetail(convId).catch(() => {})
      toast(`Added ${displayName(u)}`, 'success')
      setAdding(false)
    }
  }
  const remove = (u: UserPublic) =>
    void confirmAction({
      title: `Remove ${displayName(u)}?`,
      body: `They will lose access to ${name} and its messages.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        if (
          await run(() => chatApi.removeMember(convId, u.id), 'Could not remove member')
        )
          await loadDetail(convId).catch(() => {})
      },
    })
  const leave = () =>
    void confirmAction({
      title: `Leave ${name}?`,
      body: 'You will no longer see this group or its messages unless someone adds you again.',
      confirmLabel: 'Leave group',
      danger: true,
      onConfirm: async () => {
        if (
          await run(() => chatApi.removeMember(convId, me.id), 'Could not leave group')
        ) {
          onClose()
          navigate('/', { replace: true })
          removeConversation(convId)
          toast(`You left ${name}`, 'info')
        }
      },
    })

  return (
    <Dialog
      title={conv?.name ?? 'Group'}
      description={`${members.length} member${members.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={
        !adding && (
          <>
            <Button
              variant="danger-ghost"
              icon={LogOut}
              onClick={leave}
              className="mr-auto"
            >
              Leave group
            </Button>
            {isAdmin && (
              <Button icon={UserPlus} onClick={() => setAdding(true)}>
                Add members
              </Button>
            )}
          </>
        )
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {adding ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Only friends can be added. Pick someone to add.
          </p>
          <UserPicker
            onPick={(u) => void add(u)}
            selectedIds={members.map((m) => m.user.id)}
            friendsOnly
          />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {members.map((m) => {
            const self = m.user.id === me.id
            const on = self || !!online[m.user.id]
            return (
              <li
                key={m.user.id}
                className="flex min-h-14 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2"
              >
                <Avatar id={m.user.id} name={displayName(m.user)} size={36} online={on} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {displayName(m.user)}
                    {self && <span className="font-normal text-muted"> (you)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {on
                      ? 'Online'
                      : lastSeenText(lastSeen[m.user.id] ?? m.user.last_seen_at)}
                  </span>
                </span>
                {m.role === 'admin' && <Tag>Admin</Tag>}
                {isAdmin && !self && (
                  <IconButton
                    label={`Remove ${displayName(m.user)}`}
                    icon={UserMinus}
                    size="sm"
                    tooltip="left"
                    disabled={busy}
                    onClick={() => remove(m.user)}
                    className="hover:!bg-danger-soft hover:!text-danger"
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
