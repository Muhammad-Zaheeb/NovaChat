import { useState, type KeyboardEvent } from 'react'
import { errorMessage } from '../api'
import { useChat } from '../store/chat'

const MAX = 4000

export default function Composer({ convId }: { convId: number }) {
  const send = useChat((s) => s.send)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const content = text.trim()
    if (!content || busy || content.length > MAX) return
    setBusy(true)
    setError('')
    try {
      await send(convId, content)
      setText('')
    } catch (e) {
      setError(errorMessage(e, 'Message failed to send'))
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      {error && <p className="mb-1 text-xs text-red-500">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message…  (Enter to send, Shift+Enter for new line)"
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none [field-sizing:content] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
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
