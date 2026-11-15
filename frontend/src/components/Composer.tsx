import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useChat } from '../store/chat'
import * as socket from '../ws/socket'

const MAX = 4000

export default function Composer({ convId }: { convId: number }) {
  const sendLive = useChat((s) => s.sendLive)
  const [text, setText] = useState('')

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
    if (!value.trim()) return stopTyping()
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
    sendLive(convId, content)
    setText('')
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          maxLength={MAX}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message…  (Enter to send, Shift+Enter for new line)"
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none [field-sizing:content] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          onClick={() => submit()}
          disabled={!text.trim()}
          className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
      {text.length > MAX - 200 && (
        <p className="mt-1 text-right text-xs text-slate-500">
          {text.length}/{MAX}
        </p>
      )}
    </div>
  )
}
