import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatApi, errorMessage, type UserPublic } from '../api'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useLive } from '../store/live'
import Modal from './Modal'
import UserPicker from './UserPicker'
import { Avatar, Button } from './ui'

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
  const [adding, setAdding] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The backend does not broadcast membership changes, so refresh on open.
  useEffect(() => {
    loadDetail(convId).catch(() => setError('Could not refresh members'))
  }, [convId, loadDetail])

  const members = detail?.members ?? []
  const isAdmin = members.some((m) => m.user.id === me.id && m.role === 'admin')

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
      return setError(`${u.username} is already a member`)
    if (await run(() => chatApi.addMember(convId, u.id), 'Could not add member')) {
      await loadDetail(convId).catch(() => {})
      setAdding(false)
    }
  }
  const remove = async (id: number) => {
    if (await run(() => chatApi.removeMember(convId, id), 'Could not remove member'))
      await loadDetail(convId).catch(() => {})
  }
  const leave = async () => {
    if (await run(() => chatApi.removeMember(convId, me.id), 'Could not leave group')) {
      onClose()
      navigate('/', { replace: true })
      removeConversation(convId)
    }
  }

  if (confirmLeave)
    return (
      <Modal title="Leave group?" onClose={() => setConfirmLeave(false)}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          You will no longer see “{conv?.name}” or its messages unless someone adds you
          again.
        </p>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            className="h-10 !bg-slate-200 !text-slate-800 hover:!bg-slate-300 dark:!bg-slate-800 dark:!text-slate-100"
            onClick={() => setConfirmLeave(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-10 !bg-red-600 hover:!bg-red-700"
            disabled={busy}
            onClick={leave}
          >
            {busy ? 'Leaving…' : 'Leave'}
          </Button>
        </div>
      </Modal>
    )

  return (
    <Modal title={conv?.name ?? 'Group'} onClose={onClose}>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {members.length} member{members.length === 1 ? '' : 's'}
      </p>
      <ul className="max-h-64 overflow-y-auto">
        {members.map((m) => (
          <li key={m.user.id} className="flex min-h-12 items-center gap-3 py-1">
            <Avatar
              name={m.user.username}
              size={32}
              online={m.user.id === me.id || !!online[m.user.id]}
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              {m.user.username}
              {m.user.id === me.id && ' (you)'}
            </span>
            {m.role === 'admin' && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-slate-800 dark:text-indigo-300">
                Admin
              </span>
            )}
            {isAdmin && m.user.id !== me.id && (
              <button
                disabled={busy}
                onClick={() => remove(m.user.id)}
                aria-label={`Remove ${m.user.username}`}
                className="h-10 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-slate-800"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {adding ? (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <UserPicker onPick={add} selectedIds={members.map((m) => m.user.id)} />
          <button
            onClick={() => setAdding(false)}
            className="mt-2 h-10 text-sm text-slate-500 underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {isAdmin && (
            <Button className="h-10" onClick={() => setAdding(true)}>
              Add members
            </Button>
          )}
          <Button
            className="h-10 !bg-transparent !text-red-600 ring-1 ring-red-300 hover:!bg-red-50 dark:!text-red-400 dark:ring-red-900 dark:hover:!bg-slate-800"
            onClick={() => setConfirmLeave(true)}
          >
            Leave group
          </Button>
        </div>
      )}
    </Modal>
  )
}
