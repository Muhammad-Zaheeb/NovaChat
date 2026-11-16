import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, X } from 'lucide-react'
import { chatApi, errorMessage, type UserPublic } from '../api'
import { displayName } from '../lib'
import { useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import UserPicker from './UserPicker'
import { Avatar, Button, Dialog, EmptyState, Input } from './ui'

function NoFriends({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={UserPlus}
      title="Add a friend first"
      className="py-6"
      action={
        <Button
          icon={UserPlus}
          onClick={() => {
            onClose()
            navigate('/friends?tab=find')
          }}
        >
          Find people
        </Button>
      }
    >
      You can chat with people once they accept your friend request.
    </EmptyState>
  )
}

export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const upsert = useChat((s) => s.upsertConversation)
  const hasFriends = useFriends((s) => s.friends.length > 0)
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
    <Dialog title="New chat" description="Message one of your friends." onClose={onClose}>
      {hasFriends ? (
        <UserPicker
          onPick={(u) => void start(u)}
          friendsOnly
          placeholder="Search your friends"
        />
      ) : (
        <NoFriends onClose={onClose} />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}

export function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const upsert = useChat((s) => s.upsertConversation)
  const hasFriends = useFriends((s) => s.friends.length > 0)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<UserPublic[]>([])
  const [error, setError] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggle = (u: UserPublic) =>
    setMembers((m) =>
      m.some((x) => x.id === u.id) ? m.filter((x) => x.id !== u.id) : [...m, u],
    )

  const nameError = tried && !name.trim() ? 'Give the group a name' : undefined
  const create = async () => {
    setTried(true)
    if (!name.trim()) return
    if (members.length === 0) return setError('Pick at least one friend')
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

  if (!hasFriends)
    return (
      <Dialog title="New group" onClose={onClose}>
        <NoFriends onClose={onClose} />
      </Dialog>
    )
  return (
    <Dialog
      title="New group"
      description="Name it and pick friends to invite. You will be the admin."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} loading={busy}>
            Create group
            {members.length > 0 && (
              <span className="tabular-nums">({members.length + 1})</span>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Group name"
          placeholder="e.g. Weekend plans"
          maxLength={100}
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
          data-autofocus
        />
        <div>
          <p className="mb-1.5 text-sm font-medium">Members</p>
          {members.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected members">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m)}
                    aria-label={`Remove ${displayName(m)}`}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pr-2 pl-1 text-xs font-medium animate-pop-in hover:border-line-strong"
                  >
                    <Avatar id={m.id} name={displayName(m)} size={22} />
                    {displayName(m)}
                    <X size={12} aria-hidden className="text-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <UserPicker
            onPick={toggle}
            selectedIds={members.map((m) => m.id)}
            friendsOnly
            autoFocus={false}
            placeholder="Search your friends"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
