import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

export function Spinner({
  label,
  size = 16,
  className,
}: {
  label?: string
  size?: number
  className?: string
}) {
  return (
    <LoaderCircle
      size={size}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={!label}
      className={cn('shrink-0 animate-spin motion-reduce:animate-none', className)}
    />
  )
}
