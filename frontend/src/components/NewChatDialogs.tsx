import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatApi, errorMessage, type UserPublic } from '../api'
import { useChat } from '../store/chat'
import Modal from './Modal'
import UserPicker from './UserPicker'
import { Avatar, Button, Input } from './ui'

export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const upsert = useChat((s) => s.upsertConversation)
  const [error, setError] = useState('')

  const start = async (u: UserPublic) => {
    try {
      const c = await chatApi.direct(u.id)
      upsert(c)
      onClose()
      navigate(`/c/${c.id}`)
    } catch (e) {
      setError(errorMessage(e, 'Could not start chat'))
    }
  }
  return (
    <Modal title="New chat" onClose={onClose}>
      <UserPicker onPick={start} />
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Modal>
  )
}

export function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const upsert = useChat((s) => s.upsertConversation)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<UserPublic[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (u: UserPublic) =>
    setMembers((m) =>
      m.some((x) => x.id === u.id) ? m.filter((x) => x.id !== u.id) : [...m, u],
    )

  const create = async () => {
    if (!name.trim()) return setError('Give the group a name')
    if (members.length === 0) return setError('Pick at least one member')
    setBusy(true)
    try {
      const c = await chatApi.group(
        name.trim(),
        members.map((m) => m.id),
      )
      upsert(c)
      onClose()
      navigate(`/c/${c.id}`)
    } catch (e) {
      setError(errorMessage(e, 'Could not create group'))
      setBusy(false)
    }
  }

  return (
    <Modal title="New group" onClose={onClose}>
      <div className="space-y-3">
        <Input
          placeholder="Group name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {members.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => toggle(m)}
                className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-2 pl-1 text-xs text-brand-700 dark:bg-slate-800 dark:text-brand-50"
              >
                <Avatar name={m.username} size={20} /> {m.username} ✕
              </button>
            ))}
          </div>
        )}
        <UserPicker onPick={toggle} selectedIds={members.map((m) => m.id)} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button onClick={create} disabled={busy} className="w-full">
          {busy ? 'Creating…' : 'Create group'}
        </Button>
      </div>
    </Modal>
  )
}
