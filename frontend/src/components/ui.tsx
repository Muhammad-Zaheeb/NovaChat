import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

export function Button({
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`min-h-10 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  )
}

export function Input({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={`w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    />
  )
}

export function Avatar({
  name,
  size = 40,
  online,
}: {
  name: string
  size?: number
  online?: boolean
}) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div className="relative shrink-0">
      <div
        className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
        style={{
          width: size,
          height: size,
          background: `hsl(${hue} 55% 48%)`,
          fontSize: size / 2.4,
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
      {online && (
        <span
          title="Online"
          className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-slate-900"
        />
      )}
    </div>
  )
}
