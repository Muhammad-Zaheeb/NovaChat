import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil, Reply, SendHorizontal, X } from 'lucide-react'
import { chatApi, errorMessage } from '../../api'
import { toast } from '../../store/toast'
import { useAuth } from '../../store/auth'
import { useChat } from '../../store/chat'
import * as socket from '../../ws/socket'
import { IconButton, Kbd, cn } from '../ui'
import { EDIT_MS } from '../../lib'

const MAX = 4000

export default function Composer({ convId, title }: { convId: number; title: string }) {
  const meId = useAuth((s) => s.user!.id)
  const sendLive = useChat((s) => s.sendLive)
  const [text, setText] = useState('')
  const replyTo = useChat((s) => s.replyTo)
  const editing = useChat((s) => s.editing)
  const setEditing = useChat((s) => s.setEditing)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const members = useChat((s) => s.details[convId]?.members)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const nameOf = (id: number) => {
    if (id === meId) return 'yourself'
    const u = members?.find((m) => m.user.id === id)?.user
    return u ? u.display_name || u.username : 'a former member'
  }
  // Entering edit mode loads the message into the box; replying focuses it.
  const [seenEditing, setSeenEditing] = useState<number | null>(null)
  if ((editing?.id ?? null) !== seenEditing) {
    setSeenEditing(editing?.id ?? null)
    if (editing) setText(editing.content)
  }
  useEffect(() => {
    if (editing || replyTo) taRef.current?.focus()
  }, [editing, replyTo])
  // Opening a chat puts the cursor in the message box (not on touch: no surprise keyboard).
  useEffect(() => {
    if (matchMedia('(pointer: fine)').matches)
      taRef.current?.focus({ preventScroll: true })
  }, [convId])

  const lastStart = useRef(0)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const typing = useRef(false)

  const stopTyping = () => {
    clearTimeout(idle.current)
    if (typing.current) socket.send('typing.stop', { conversation_id: convId })
    typing.current = false
    lastStart.current = 0
  }
  // Leaving the chat counts as stopping.
  const stopRef = useRef(stopTyping)
  useEffect(() => {
    stopRef.current = stopTyping
  })
  useEffect(() => () => stopRef.current(), [])

  const onType = (value: string) => {
    setText(value)
    if (!value.trim() || editing) return stopTyping()
    const now = Date.now()
    if (now - lastStart.current > 2000) {
      socket.send('typing.start', { conversation_id: convId })
      lastStart.current = now
      typing.current = true
    }
    clearTimeout(idle.current)
    idle.current = setTimeout(stopTyping, 3000)
  }

  const submit = () => {
    const content = text.trim()
    if (!content || content.length > MAX) return
    stopTyping()
    if (editing) {
      const id = editing.id
      setEditing(null)
      setText('')
      if (content !== editing.content)
        chatApi
          .edit(convId, id, content)
          .catch((e) => toast(errorMessage(e, 'Could not edit')))
      return
    }
    sendLive(convId, content, undefined, replyTo?.id)
    setReplyTo(null)
    setText('')
  }

  const cancel = () => {
    setEditing(null)
    setReplyTo(null)
    setText('')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (editing || replyTo)) {
      e.preventDefault()
      cancel()
    }
    // ↑ in an empty box edits your most recent message (while it is still editable).
    if (e.key === 'ArrowUp' && !text && !editing) {
      const items = useChat.getState().threads[convId]?.items ?? []
      const last = items.findLast((m) => m.sender_id === meId && !m.deleted)
      if (last && Date.now() - new Date(last.created_at).getTime() < EDIT_MS) {
        e.preventDefault()
        setEditing(last)
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const near = text.length > MAX - 300
  const ready = !!text.trim()
  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-3 rounded-md border-l-2 border-accent bg-surface-2 py-1.5 pr-1 pl-3 text-sm animate-rise-in">
          {editing ? (
            <Pencil size={16} aria-hidden className="shrink-0 text-accent-text" />
          ) : (
            <Reply size={16} aria-hidden className="shrink-0 text-accent-text" />
          )}
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-accent-text">
              {editing ? 'Editing message' : `Replying to ${nameOf(replyTo!.sender_id)}`}
            </span>
            <span className="block truncate text-muted">
              {(editing ?? replyTo)!.content}
            </span>
          </div>
          <span className="hidden text-xs text-subtle md:inline">
            <Kbd>Esc</Kbd> to cancel
          </span>
          <IconButton
            label={editing ? 'Cancel editing' : 'Cancel reply'}
            icon={X}
            size="sm"
            tooltip={false}
            onClick={cancel}
          />
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={taRef}
            aria-label={`Message ${title}`}
            aria-describedby={near ? `count-${convId}` : undefined}
            rows={1}
            value={text}
            maxLength={MAX}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Message ${title}`}
            className="block max-h-40 min-h-11 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2.5 text-base leading-snug text-fg outline-none [field-sizing:content] placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/20 md:text-sm"
          />
        </div>
        <IconButton
          label={editing ? 'Save edit' : 'Send message'}
          icon={SendHorizontal}
          variant={ready ? 'primary' : 'ghost'}
          tooltip="top"
          disabled={!ready}
          onClick={submit}
          className="!h-11 !w-11"
        />
      </div>
      <div
        className={cn(
          'mt-1 h-4 items-center justify-between text-[11px] text-subtle',
          near ? 'flex' : 'hidden md:flex',
        )}
      >
        <span className={cn('hidden md:inline', !ready && 'invisible')}>
          <Kbd className="!h-4">Enter</Kbd> to {editing ? 'save' : 'send'} ·{' '}
          <Kbd className="!h-4">Shift</Kbd> + <Kbd className="!h-4">Enter</Kbd> for a new
          line
        </span>
        {near && (
          <span
            id={`count-${convId}`}
            className={cn('ml-auto tabular-nums', text.length >= MAX && 'text-danger')}
          >
            {MAX - text.length} characters left
          </span>
        )}
      </div>
    </div>
  )
}
