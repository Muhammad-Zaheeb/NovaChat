import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { useChat } from '../store/chat'
import { useFriends } from '../store/friends'
import { useOnboarding } from '../store/onboarding'
import { Button, IconButton, cn } from './ui'

/** Dismissible first-run checklist: Find people → Send a request → Start chatting. */
export default function Onboarding() {
  const navigate = useNavigate()
  const { visitedFind, dismissed, dismiss } = useOnboarding()
  const friendsLoaded = useFriends((s) => s.loaded)
  const friends = useFriends((s) => s.friends.length)
  const outgoing = useFriends((s) => s.outgoing.length)
  const incoming = useFriends((s) => s.incoming.length)
  const listLoaded = useChat((s) => s.listLoaded)
  const chatted = useChat((s) => Object.keys(s.conversations).length > 0)

  const steps = [
    {
      label: 'Find people',
      text: 'Search by username or email.',
      done: visitedFind || friends + outgoing + incoming > 0,
      action: () => navigate('/friends?tab=find'),
      cta: 'Find',
    },
    {
      label: 'Send a request',
      text: 'They can accept from Friends.',
      done: friends + outgoing + incoming > 0,
      action: () => navigate('/friends?tab=find'),
      cta: 'Add',
    },
    {
      label: 'Start chatting',
      text:
        incoming > 0
          ? `You have ${incoming} friend request${incoming === 1 ? '' : 's'}. Accept to start chatting.`
          : 'Message a friend once they accept.',
      done: chatted,
      action: () =>
        navigate(
          incoming > 0
            ? '/friends?tab=requests'
            : friends
              ? '/friends?tab=friends'
              : '/friends?tab=find',
        ),
      cta: incoming > 0 ? 'Review' : 'Chat',
    },
  ]
  const done = steps.filter((s) => s.done).length
  if (dismissed || !friendsLoaded || !listLoaded || done === steps.length) return null
  const next = steps.findIndex((s) => !s.done)

  return (
    <section
      aria-labelledby="onb-title"
      className="mx-3 mb-2 rounded-md border border-line bg-surface-2 p-3 animate-fade-in"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 id="onb-title" className="text-sm font-semibold">
            Get started
          </h2>
          <p className="text-xs text-muted">
            <span className="tabular-nums">{done}</span> of 3 done
          </p>
        </div>
        <IconButton
          label="Dismiss getting started"
          icon={X}
          size="sm"
          tooltip="left"
          onClick={dismiss}
          className="-mt-1 -mr-1"
        />
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-(--dur)"
          style={{ width: `${(done / 3) * 100}%` }}
        />
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                s.done
                  ? 'bg-accent text-accent-fg'
                  : i === next
                    ? 'border border-accent text-accent-text'
                    : 'border border-line-strong text-subtle',
              )}
            >
              {s.done ? <Check size={12} aria-label="Done" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-sm',
                  s.done ? 'text-muted line-through' : 'font-medium text-fg',
                )}
              >
                {s.label}
              </span>
              {i === next && <span className="block text-xs text-muted">{s.text}</span>}
            </span>
            {i === next && (
              <Button size="sm" onClick={s.action}>
                {s.cta}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
