import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { EmptyState } from './ui'

export default function NotFound({
  message = 'Page not found',
  conversation = false,
}: {
  message?: string
  conversation?: boolean
}) {
  return (
    <EmptyState
      icon={Compass}
      title={message}
      className="flex-1"
      action={
        <Link
          to="/"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm hover:bg-accent-hover"
        >
          <ArrowLeft size={16} aria-hidden /> Back to chats
        </Link>
      }
    >
      {conversation
        ? 'The link may be broken, or you may no longer be a member of this conversation.'
        : 'The page you are looking for does not exist or has moved.'}
    </EmptyState>
  )
}
