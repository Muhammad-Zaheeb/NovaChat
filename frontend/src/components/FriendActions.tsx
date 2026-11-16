import { useState } from 'react'
import { Check, Clock, MessageSquare, UserPlus } from 'lucide-react'
import { errorMessage, friendsApi, type UserPublic } from '../api'
import { displayName } from '../lib'
import { toast } from '../store/toast'
import { useFriends, useStatusOf } from '../store/friends'
import { useMessage } from './useMessage'
import { Button } from './ui'

/** The right action for a user, based on live friendship status. */
export default function FriendActions({
  user,
  onMessaged,
}: {
  user: UserPublic
  onMessaged?: () => void
}) {
  const status = useStatusOf(user.id)
  const load = useFriends((s) => s.load)
  const incoming = useFriends((s) => s.incoming)
  const message = useMessage()
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, fallback: string, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast(ok, 'success')
    } catch (e) {
      toast(errorMessage(e, fallback))
    }
    await load().catch(() => {})
    setBusy(false)
  }

  if (status === 'friends')
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={MessageSquare}
        onClick={() => void message(user.id, onMessaged)}
      >
        Message
      </Button>
    )
  if (status === 'pending_outgoing')
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-2 text-sm text-muted">
        <Clock size={14} aria-hidden /> Request sent
      </span>
    )
  if (status === 'pending_incoming') {
    const req = incoming.find((r) => r.requester.id === user.id)
    return (
      <Button
        size="sm"
        icon={Check}
        loading={busy}
        disabled={!req}
        onClick={() =>
          req &&
          void run(
            () => friendsApi.accept(req.id),
            'Could not accept',
            `You and ${displayName(user)} are now friends`,
          )
        }
      >
        Accept
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      icon={UserPlus}
      loading={busy}
      onClick={() =>
        void run(
          () => friendsApi.send(user.id),
          'Could not send request',
          `Friend request sent to ${displayName(user)}`,
        )
      }
    >
      Add friend
    </Button>
  )
}
