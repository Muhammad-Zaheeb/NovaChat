import { Link } from 'react-router-dom'

export default function NotFound({ message = 'Page not found' }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-brand-600 dark:text-indigo-400">404</p>
      <h1 className="text-lg font-semibold">{message}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        It may not exist, or you may not be a member.
      </p>
      <Link
        to="/"
        className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to chats
      </Link>
    </div>
  )
}
