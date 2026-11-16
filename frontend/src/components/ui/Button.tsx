import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { Spinner } from './Spinner'
import { Tooltip } from './Tooltip'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-2 shadow-sm',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger-hover shadow-sm',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 pointer-coarse:h-11',
  md: 'h-10 px-4 text-sm gap-2 pointer-coarse:h-11',
  lg: 'h-11 px-5 text-base gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: LucideIcon
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...p
}: ButtonProps) {
  return (
    <button
      type={type}
      {...p}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
        'transition-[background-color,color,box-shadow,transform] duration-(--dur-fast) active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Spinner size={16} /> : Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: LucideIcon
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'primary' | 'secondary'
  tooltip?: boolean | 'top' | 'bottom' | 'right' | 'left'
  /** Toggle state; sets aria-pressed. */
  active?: boolean
  badge?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  icon: Icon,
  size = 'md',
  variant = 'ghost',
  tooltip = true,
  active,
  badge,
  className,
  type = 'button',
  ...p
}: IconButtonProps) {
  const btn = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      {...p}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-(--dur-fast)',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        'pointer-coarse:h-11 pointer-coarse:w-11',
        variant === 'primary'
          ? 'bg-accent text-accent-fg hover:bg-accent-hover'
          : variant === 'secondary'
            ? 'border border-line-strong bg-surface text-fg hover:bg-surface-2'
            : active
              ? 'bg-accent-soft text-accent-text'
              : 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <Icon size={size === 'sm' ? 16 : 18} aria-hidden />
      {badge}
    </button>
  )
  if (!tooltip) return btn
  return (
    <Tooltip label={label} side={tooltip === true ? 'bottom' : tooltip}>
      {btn}
    </Tooltip>
  )
}
