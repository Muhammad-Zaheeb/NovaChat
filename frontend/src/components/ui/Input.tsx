import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleAlert } from 'lucide-react'
import { cn } from './cn'

const control =
  'w-full rounded-md border bg-surface text-base text-fg placeholder:text-subtle outline-none transition-[border-color,box-shadow] duration-(--dur-fast) md:text-sm ' +
  'focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-60'

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Shown at the right end of the label row (e.g. a counter). */
  aside?: ReactNode
  hideLabel?: boolean
}

function Field({
  id,
  label,
  hint,
  error,
  aside,
  hideLabel,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {(label || aside) && (
        <div
          className={cn(
            'flex items-baseline justify-between gap-2',
            hideLabel && 'sr-only',
          )}
        >
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-fg">
              {label}
            </label>
          )}
          {aside && <span className="text-xs text-subtle tabular-nums">{aside}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-msg`} className="flex items-center gap-1.5 text-xs text-danger">
          <CircleAlert size={14} aria-hidden /> {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="text-xs text-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  icon?: LucideIcon
  /** Element inside the right edge (e.g. a visibility toggle). */
  trailing?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Input({
  label,
  hint,
  error,
  aside,
  hideLabel,
  icon: Icon,
  trailing,
  className,
  id,
  ...p
}: InputProps) {
  const auto = useId()
  const fid = id ?? auto
  const describedBy = error || hint ? `${fid}-msg` : undefined
  const input = (
    <div className="relative">
      {Icon && (
        <Icon
          size={16}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
        />
      )}
      <input
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...p}
        className={cn(
          control,
          'h-10 px-3 pointer-coarse:h-11',
          Icon && 'pl-9',
          trailing != null && 'pr-11',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-line-strong',
          className,
        )}
      />
      {trailing && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
          {trailing}
        </div>
      )}
    </div>
  )
  if (!label && !hint && !error && !aside) return input
  return (
    <Field
      id={fid}
      label={label}
      hint={hint}
      error={error}
      aside={aside}
      hideLabel={hideLabel}
    >
      {input}
    </Field>
  )
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({
  label,
  hint,
  error,
  aside,
  hideLabel,
  className,
  id,
  ...p
}: TextareaProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Field
      id={fid}
      label={label}
      hint={hint}
      error={error}
      aside={aside}
      hideLabel={hideLabel}
    >
      <textarea
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        {...p}
        className={cn(
          control,
          'resize-none px-3 py-2',
          error ? 'border-danger' : 'border-line-strong',
          className,
        )}
      />
    </Field>
  )
}
