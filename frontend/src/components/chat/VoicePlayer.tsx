import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Attachment } from '../../api'
import { formatDuration } from '../../lib'
import { mediaUrl } from '../../store/avatars'
import { cn } from '../ui'

const BARS = 36

/** Deterministic pseudo-waveform, used until (or instead of) real peaks. */
const fallbackPeaks = (seed: number) =>
  Array.from(
    { length: BARS },
    (_, i) =>
      0.25 + 0.6 * Math.abs(Math.sin(seed * 1.7 + i * 0.9) * Math.cos(i * 0.37 + seed)),
  )

const cache = new Map<number, number[]>()

/** Peaks are computed once per attachment by decoding the file (small: voice notes are <= 5 MB). */
async function computePeaks(a: Attachment): Promise<number[]> {
  const hit = cache.get(a.id)
  if (hit) return hit
  const res = await fetch(mediaUrl(a.url), { credentials: 'include' })
  const buf = await res.arrayBuffer()
  const Ctx =
    window.AudioContext ??
    (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(buf)
    const ch = audio.getChannelData(0)
    const step = Math.max(1, Math.floor(ch.length / BARS))
    const raw = Array.from({ length: BARS }, (_, b) => {
      let max = 0
      for (let i = b * step; i < Math.min(ch.length, (b + 1) * step); i += 8)
        max = Math.max(max, Math.abs(ch[i]))
      return max
    })
    const top = Math.max(...raw, 0.01)
    const peaks = raw.map((v) => 0.15 + 0.85 * (v / top))
    cache.set(a.id, peaks)
    return peaks
  } finally {
    void ctx.close()
  }
}

/** Custom audio player: play/pause, waveform that doubles as a seek bar, time. */
export default function VoicePlayer({ a, mine }: { a: Attachment; mine: boolean }) {
  const el = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [elDur, setElDur] = useState(0)
  const [peaks, setPeaks] = useState<number[]>(
    () => cache.get(a.id) ?? fallbackPeaks(a.id),
  )
  const dur = a.duration ?? elDur

  useEffect(() => {
    if (cache.has(a.id)) return
    let live = true
    computePeaks(a)
      .then((p) => live && setPeaks(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [a])

  const toggle = () => {
    const x = el.current
    if (!x) return
    if (x.paused) {
      // only one voice message plays at a time
      document.querySelectorAll('audio').forEach((o) => o !== x && o.pause())
      void x.play()
    } else x.pause()
  }
  const seek = (frac: number) => {
    const x = el.current
    if (!x || !dur) return
    x.currentTime = Math.max(0, Math.min(1, frac)) * dur
    setT(x.currentTime)
  }
  const frac = dur ? Math.min(1, t / dur) : 0

  return (
    <div className="flex w-60 max-w-full items-center gap-2.5">
      <audio
        ref={el}
        src={mediaUrl(a.url)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setT(0)
        }}
        onTimeUpdate={(e) => setT(Math.min(e.currentTarget.currentTime, dur || Infinity))}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration))
            setElDur(e.currentTarget.duration)
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors',
          mine
            ? 'bg-white/25 hover:bg-white/35'
            : 'bg-accent text-accent-fg hover:bg-accent-hover',
        )}
      >
        {playing ? (
          <Pause size={16} aria-hidden />
        ) : (
          <Play size={16} aria-hidden className="ml-0.5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${formatDuration(t)} of ${formatDuration(dur)}`}
          className="flex h-8 cursor-pointer items-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            seek((e.clientX - r.left) / r.width)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seek(frac + 5 / (dur || 1))
            else if (e.key === 'ArrowLeft') seek(frac - 5 / (dur || 1))
            else if (e.key === ' ') {
              e.preventDefault()
              toggle()
            }
          }}
        >
          {peaks.map((p, i) => (
            <span
              key={i}
              className={cn(
                'w-full rounded-full',
                i / BARS < frac
                  ? mine
                    ? 'bg-white'
                    : 'bg-accent'
                  : mine
                    ? 'bg-white/45'
                    : 'bg-line-strong',
              )}
              style={{ height: `${Math.round(p * 100)}%` }}
            />
          ))}
        </div>
        <span className="block text-xs tabular-nums opacity-75">
          {formatDuration(playing || t > 0 ? t : dur)}
          {(playing || t > 0) && dur ? ` / ${formatDuration(dur)}` : ''}
        </span>
      </div>
    </div>
  )
}
