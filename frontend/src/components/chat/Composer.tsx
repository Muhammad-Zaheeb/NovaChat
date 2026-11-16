import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  File as FileIcon,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Reply,
  SendHorizontal,
  X,
} from 'lucide-react'
import { chatApi, errorMessage, filesApi } from '../../api'
import { toast } from '../../store/toast'
import { useAuth } from '../../store/auth'
import { useChat } from '../../store/chat'
import * as socket from '../../ws/socket'
import { IconButton, Kbd, cn } from '../ui'
import { EDIT_MS, formatBytes, voiceSupported, messagePreview } from '../../lib'
import { useUploads } from './useUploads'
import VoiceBar from './VoiceBar'

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
  const fileRef = useRef<HTMLInputElement>(null)
  const up = useUploads()
  const [dragging, setDragging] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sending, setSending] = useState(false)
  const uploading = up.items.some((i) => i.status === 'uploading')
  const doneItems = up.items.filter((i) => i.status === 'done')
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

  // Drag files anywhere over the chat to attach them.
  const addRef = useRef(up.add)
  useEffect(() => {
    addRef.current = up.add
  })
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (!useChat.getState().editing) addRef.current([...(e.dataTransfer?.files ?? [])])
    }
    document.addEventListener('dragenter', enter)
    document.addEventListener('dragleave', leave)
    document.addEventListener('dragover', over)
    document.addEventListener('drop', drop)
    return () => {
      document.removeEventListener('dragenter', enter)
      document.removeEventListener('dragleave', leave)
      document.removeEventListener('dragover', over)
      document.removeEventListener('drop', drop)
    }
  }, [])

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
    if (!editing && up.items.length) {
      if (uploading || sending || (!doneItems.length && !content) || content.length > MAX)
        return
      stopTyping()
      setSending(true)
      void useChat
        .getState()
        .send(
          convId,
          content,
          replyTo?.id,
          doneItems.map((i) => i.att!.id),
        )
        .then(() => {
          up.clear()
          setReplyTo(null)
          setText('')
        })
        .catch((e) => toast(errorMessage(e, 'Could not send')))
        .finally(() => setSending(false))
      return
    }
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
      const last = items.findLast(
        (m) => m.sender_id === meId && !m.deleted && !m.attachments?.length,
      )
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

  const sendVoice = async (blob: Blob, seconds: number) => {
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const att = await filesApi.upload(blob, `voice.${ext}`, {
        voice: true,
        duration: seconds,
      })
      await useChat.getState().send(convId, '', replyTo?.id, [att.id])
      setReplyTo(null)
      setRecording(false)
    } catch (e) {
      toast(errorMessage(e, 'Could not send voice message'))
      throw e
    }
  }

  const near = text.length > MAX - 300
  const ready = editing
    ? !!text.trim()
    : !uploading && !sending && (doneItems.length > 0 || !!text.trim())
  return (
    <div className="relative shrink-0 border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
      {dragging && !editing && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]"
        >
          <div className="rounded-lg border-2 border-dashed border-accent bg-surface px-8 py-6 text-sm font-medium text-accent-text shadow-lg">
            Drop files to attach
          </div>
        </div>
      )}
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
              {messagePreview((editing ?? replyTo)!)}
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
      {up.items.length > 0 && !editing && (
        <ul
          className="mb-2 flex gap-2 overflow-x-auto pb-1"
          aria-label="Attachments to send"
        >
          {up.items.map((i) => (
            <li
              key={i.key}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2 animate-pop-in"
              title={`${i.name} · ${formatBytes(i.size)}`}
            >
              {i.preview ? (
                <img
                  src={i.preview}
                  alt={i.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-subtle">
                  <FileIcon size={20} aria-hidden />
                  <span className="w-full truncate text-center text-[10px]">
                    {i.name}
                  </span>
                </span>
              )}
              {i.status === 'uploading' && (
                <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-white">
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  <span className="mt-0.5 text-[10px] tabular-nums">
                    {Math.round(i.progress * 100)}%
                  </span>
                </span>
              )}
              {i.status === 'error' && (
                <span
                  className="absolute inset-0 flex items-center justify-center bg-danger/80 p-1 text-center text-[10px] leading-tight text-white"
                  title={i.error}
                >
                  Failed
                </span>
              )}
              <button
                type="button"
                aria-label={
                  i.status === 'uploading'
                    ? `Cancel upload of ${i.name}`
                    : `Remove ${i.name}`
                }
                onClick={() => up.remove(i.key)}
                className="absolute top-0.5 right-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/80"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {recording ? (
        <VoiceBar
          onSend={sendVoice}
          onCancel={() => setRecording(false)}
          onError={(m) => {
            setRecording(false)
            toast(m)
          }}
        />
      ) : (
        <div className="flex items-end gap-2">
          {!editing && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                data-testid="attach-input"
                aria-label="Choose files to attach"
                className="hidden"
                onChange={(e) => {
                  up.add([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <IconButton
                label="Attach files"
                icon={Paperclip}
                tooltip="top"
                onClick={() => fileRef.current?.click()}
                className="!h-11 !w-11"
              />
            </>
          )}
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
              onPaste={(e) => {
                const files = [...e.clipboardData.files]
                if (files.length && !editing) {
                  e.preventDefault()
                  up.add(files)
                }
              }}
              placeholder={`Message ${title}`}
              className="block max-h-40 min-h-11 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2.5 text-base leading-snug text-fg outline-none [field-sizing:content] placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/20 md:text-sm"
            />
          </div>
          {!editing && !ready && !up.items.length && voiceSupported() ? (
            <IconButton
              label="Record voice message"
              icon={Mic}
              variant="ghost"
              tooltip="top"
              onClick={() => setRecording(true)}
              className="!h-11 !w-11"
            />
          ) : (
            <IconButton
              label={editing ? 'Save edit' : 'Send message'}
              icon={SendHorizontal}
              variant={ready ? 'primary' : 'ghost'}
              tooltip="top"
              disabled={!ready}
              onClick={submit}
              className="!h-11 !w-11"
            />
          )}
        </div>
      )}
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
