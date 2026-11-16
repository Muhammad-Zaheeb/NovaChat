import { useState } from 'react'
import { Users } from 'lucide-react'
import { mediaUrl, useAvatars } from '../../store/avatars'
import { cn } from './cn'
import { avatarColor } from './helpers'

export function Avatar({
  name,
  id,
  size = 40,
  online,
  group,
  className,
}: {
  name: string
  /** User (or conversation) id; drives the colour. */
  id?: number
  size?: number
  online?: boolean
  group?: boolean
  className?: string
}) {
  const dot = Math.max(8, Math.round(size / 4))
  const url = useAvatars((s) => (id !== undefined && !group ? s.urls[id] : null))
  const [failed, setFailed] = useState<string | null>(null)
  const showImg = !!url && failed !== url
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden>
      <span
        className="flex items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none"
        style={{
          width: size,
          height: size,
          background: avatarColor(id, name),
          fontSize: Math.round(size / 2.5),
        }}
      >
        {showImg ? (
          <img
            src={mediaUrl(url)}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(url)}
            className="h-full w-full rounded-full object-cover"
          />
        ) : group ? (
          <Users size={Math.round(size / 2.2)} />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-surface transition-colors',
            online ? 'bg-success' : 'hidden',
          )}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  )
}
