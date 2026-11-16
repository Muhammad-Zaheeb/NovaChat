import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  File as FileIcon,
  FileText,
  X,
} from 'lucide-react'
import type { Attachment } from '../../api'
import { formatBytes } from '../../lib'
import { mediaUrl } from '../../store/avatars'
import { cn } from '../ui'
import VoicePlayer from './VoicePlayer'

const download = (a: Attachment) => `${mediaUrl(a.url)}?download=1`

/** Full-screen image viewer: arrows / ←→ to move, Esc to close, download button. */
function Viewer({
  images,
  start,
  onClose,
}: {
  images: Attachment[]
  start: number
  onClose: () => void
}) {
  const [i, setI] = useState(start)
  const a = images[i]
  const go = (d: number) => setI((x) => (x + d + images.length) % images.length)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      opener?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length])
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${i + 1} of ${images.length}`}
      className="fixed inset-0 z-[80] flex flex-col bg-black/90 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 p-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 flex-1 truncate text-sm">{a.original_name}</span>
        {images.length > 1 && (
          <span className="text-sm tabular-nums opacity-80">
            {i + 1} / {images.length}
          </span>
        )}
        <a
          href={download(a)}
          download={a.original_name}
          aria-label="Download"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/15"
        >
          <Download size={20} aria-hidden />
        </a>
        <button
          type="button"
          autoFocus
          aria-label="Close"
          onClick={onClose}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-white/15"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 md:p-6">
        <img
          key={a.id}
          src={mediaUrl(a.url)}
          alt={a.original_name}
          className="max-h-full max-w-full rounded-sm object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {images.length > 1 &&
          ([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-label={d < 0 ? 'Previous image' : 'Next image'}
              onClick={(e) => {
                e.stopPropagation()
                go(d)
              }}
              className={cn(
                'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25',
                d < 0 ? 'left-2 md:left-6' : 'right-2 md:right-6',
              )}
            >
              {d < 0 ? (
                <ChevronLeft size={24} aria-hidden />
              ) : (
                <ChevronRight size={24} aria-hidden />
              )}
            </button>
          ))}
      </div>
    </div>,
    document.body,
  )
}

function FileCard({ a, mine }: { a: Attachment; mine: boolean }) {
  const Icon =
    a.mime === 'application/pdf' || a.mime === 'text/plain' ? FileText : FileIcon
  return (
    <a
      href={download(a)}
      download={a.original_name}
      className={cn(
        'flex w-64 max-w-full items-center gap-3 rounded-md border p-2.5 no-underline transition-colors',
        mine
          ? 'border-white/25 bg-white/10 hover:bg-white/20'
          : 'border-line bg-surface-2 hover:bg-surface-3',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
          mine ? 'bg-white/20' : 'bg-accent-soft text-accent-text',
        )}
      >
        <Icon size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.original_name}</span>
        <span className="block text-xs opacity-75">{formatBytes(a.size)}</span>
      </span>
      <Download size={16} aria-label="Download" className="shrink-0 opacity-75" />
    </a>
  )
}

export default function MessageMedia({
  attachments,
  mine,
}: {
  attachments: Attachment[]
  mine: boolean
}) {
  const [open, setOpen] = useState<number | null>(null)
  const images = attachments.filter((a) => a.kind === 'image')
  const others = attachments.filter((a) => a.kind !== 'image')
  const shown = images.slice(0, 4)
  return (
    <div className="space-y-1.5 whitespace-normal">
      {images.length > 0 && (
        <div
          className={cn(
            'grid gap-1 overflow-hidden rounded-md',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {shown.map((a, idx) => (
            <button
              key={a.id}
              type="button"
              aria-label={`Open image ${a.original_name}`}
              onClick={() => setOpen(idx)}
              className={cn(
                'relative block cursor-zoom-in overflow-hidden bg-black/10',
                images.length === 1
                  ? 'max-h-80 w-72 max-w-full'
                  : images.length === 3 && idx === 2
                    ? 'col-span-2 aspect-video w-full'
                    : 'aspect-square w-36 md:w-40',
              )}
            >
              <img
                src={mediaUrl(a.thumb_url ?? a.url)}
                alt={a.original_name}
                loading="lazy"
                width={a.width ?? undefined}
                height={a.height ?? undefined}
                className={cn(
                  'h-full w-full',
                  images.length === 1 ? 'object-contain' : 'object-cover',
                )}
              />
              {idx === 3 && images.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                  +{images.length - 4}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {others.map((a) =>
        a.kind === 'video' ? (
          <video
            key={a.id}
            controls
            preload="metadata"
            src={mediaUrl(a.url)}
            className="max-h-80 w-72 max-w-full rounded-md bg-black"
          />
        ) : a.kind === 'audio' ? (
          <VoicePlayer key={a.id} a={a} mine={mine} />
        ) : (
          <FileCard key={a.id} a={a} mine={mine} />
        ),
      )}
      {open !== null && (
        <Viewer images={images} start={open} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
