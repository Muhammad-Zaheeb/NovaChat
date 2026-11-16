import { useEffect, useRef, useState } from 'react'
import { Loader2, SendHorizontal, Square, Trash2 } from 'lucide-react'
import type { Attachment } from '../../api'
import { formatDuration } from '../../lib'
import { IconButton } from '../ui'
import VoicePlayer from './VoicePlayer'

const MAX_SECONDS = 300
const BARS = 28

function pickMime(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'])
    if (MediaRecorder.isTypeSupported(t)) return t
  return ''
}

function micError(e: unknown): string {
  const name = (e as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access is blocked. Allow it in your browser’s site settings to record voice messages.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No microphone was found on this device.'
  return 'Could not start recording.'
}

/**
 * Record → stop → preview → send. Click the mic to start, the square to stop.
 * Cancel (trash) discards at any point.
 */
export default function VoiceBar({
  onSend,
  onCancel,
  onError,
}: {
  onSend: (blob: Blob, seconds: number) => Promise<void>
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const [phase, setPhase] = useState<'starting' | 'recording' | 'preview'>('starting')
  const [secs, setSecs] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.05))
  const [clip, setClip] = useState<{
    blob: Blob
    seconds: number
    att: Attachment
  } | null>(null)
  const [sending, setSending] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const stopFn = useRef<() => void>(() => {})
  const cancelled = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let timer: ReturnType<typeof setInterval> | undefined
    const chunks: Blob[] = []
    let startedAt = 0
    let last = 0

    const cleanup = () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      stream = null
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (e) {
        if (!cancelled.current) onError(micError(e))
        return
      }
      if (cancelled.current) return cleanup()
      const mime = pickMime()
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      rec.current = r
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        const seconds = Math.max(1, (Date.now() - startedAt) / 1000)
        cleanup()
        if (cancelled.current) return
        const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setClip({
          blob,
          seconds,
          att: {
            id: -Date.now(),
            kind: 'audio',
            mime: blob.type,
            size: blob.size,
            original_name: 'Voice message',
            duration: seconds,
            url,
          },
        })
        setPhase('preview')
      }
      // live level meter
      const AC =
        window.AudioContext ??
        (window as never as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      ctx = new AC()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        if (now - last < 70) return
        last = now
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4)
        setLevels((l) => [...l.slice(1), Math.max(0.06, lvl)])
      }
      raf = requestAnimationFrame(tick)
      startedAt = Date.now()
      r.start(250)
      setPhase('recording')
      timer = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000)
        setSecs(s)
        if (s >= MAX_SECONDS) stopFn.current()
      }, 250)
    })()

    stopFn.current = () => {
      if (rec.current?.state === 'recording') rec.current.stop()
    }
    return () => {
      cancelled.current = true
      if (rec.current?.state === 'recording') rec.current.stop()
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // free the preview URL when leaving
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.att.url)), [clip])

  const send = async () => {
    if (!clip || sending) return
    setSending(true)
    try {
      await onSend(clip.blob, clip.seconds)
    } catch {
      setSending(false)
    }
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Voice message">
      <IconButton
        label="Discard voice message"
        icon={Trash2}
        tooltip="top"
        onClick={onCancel}
        className="!h-11 !w-11 hover:!text-danger"
      />
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md border border-line-strong bg-surface-2 px-3">
        {phase === 'preview' && clip ? (
          <div className="flex-1 py-1">
            <VoicePlayer a={clip.att} mine={false} />
          </div>
        ) : (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger animate-pulse"
              aria-hidden
            />
            <span className="w-10 shrink-0 text-sm tabular-nums" aria-live="off">
              {formatDuration(secs)}
            </span>
            <div className="flex h-7 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
              {levels.map((l, i) => (
                <span
                  key={i}
                  className="w-full rounded-full bg-accent transition-[height] duration-75"
                  style={{ height: `${Math.round(l * 100)}%` }}
                />
              ))}
            </div>
            <span className="sr-only" role="status">
              {phase === 'starting' ? 'Starting microphone' : 'Recording'}
            </span>
          </>
        )}
      </div>
      {phase === 'preview' ? (
        <IconButton
          label="Send voice message"
          icon={sending ? Loader2 : SendHorizontal}
          variant="primary"
          tooltip="top"
          disabled={sending}
          onClick={() => void send()}
          className="!h-11 !w-11"
        />
      ) : (
        <IconButton
          label="Stop recording"
          icon={Square}
          variant="primary"
          tooltip="top"
          disabled={phase !== 'recording'}
          onClick={() => stopFn.current()}
          className="!h-11 !w-11"
        />
      )}
    </div>
  )
}
