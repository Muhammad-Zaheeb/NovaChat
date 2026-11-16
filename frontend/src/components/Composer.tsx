import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { chatApi, errorMessage } from '../api'
import { toast } from '../store/toast'
import { useChat } from '../store/chat'
import * as socket from '../ws/socket'

const MAX = 4000

export default function Composer({ convId }: { convId: number }) {
  const sendLive = useChat((s) => s.sendLive)
  const [text, setText] = useState('')
  const replyTo = useChat((s) => s.replyTo)
  const editing = useChat((s) => s.editing)
  const setEditing = useChat((s) => s.setEditing)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const names = useChat((s) => s.details[convId]?.members)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const nameOf = (id: number) => {
    const u = names?.find((m) => m.user.id === id)?.user
    return u ? u.display_name || u.username : 'Unknown'
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
    if (e.key === 'Escape' && (editing || replyTo)) cancel()
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">
          <div className="min-w-0 flex-1">
            <span className="font-semibold">
              {editing ? 'Editing message' : `Replying to ${nameOf(replyTo!.sender_id)}`}
            </span>
            {replyTo && <span className="block truncate">{replyTo.content}</span>}
          </div>
          <button aria-label="Cancel" onClick={cancel} className="h-8 w-8 rounded-full">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          aria-label="Message"
          rows={1}
          value={text}
          maxLength={MAX}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message…"
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none md:text-sm [field-sizing:content] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          onClick={() => submit()}
          disabled={!text.trim()}
          className="h-10 min-w-16 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {editing ? 'Save' : 'Send'}
        </button>
      </div>
      {text.length > MAX - 200 && (
        <p className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">
          {text.length}/{MAX}
        </p>
      )}
    </div>
  )
}
