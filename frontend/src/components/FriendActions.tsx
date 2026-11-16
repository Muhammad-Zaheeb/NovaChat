import { useState } from 'react'
import { errorMessage, friendsApi, type UserPublic } from '../api'
import { toast } from '../store/toast'
import { useFriends, useStatusOf } from '../store/friends'
import { useMessage } from './useMessage'
import { Button } from './ui'

const small = 'h-10 !min-h-0 !px-3'
const ghost = `${small} !bg-slate-200 !text-slate-800 hover:!bg-slate-300 dark:!bg-slate-800 dark:!text-slate-100`

/** The right action button for a user, based on live friendship status. */
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

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(errorMessage(e, fallback))
    }
    await load().catch(() => {})
    setBusy(false)
  }

  if (status === 'friends')
    return (
      <Button className={small} onClick={() => void message(user.id, onMessaged)}>
        Message
      </Button>
    )
  if (status === 'pending_outgoing')
    return (
      <span className="px-3 text-sm text-slate-500 dark:text-slate-400">Requested</span>
    )
  if (status === 'pending_incoming') {
    const req = incoming.find((r) => r.requester.id === user.id)
    return (
      <Button
        className={small}
        disabled={busy || !req}
        onClick={() =>
          req && void run(() => friendsApi.accept(req.id), 'Could not accept')
        }
      >
        Accept
      </Button>
    )
  }
  return (
    <Button
      className={ghost}
      disabled={busy}
      onClick={() => void run(() => friendsApi.send(user.id), 'Could not send request')}
    >
      Add friend
    </Button>
  )
}
