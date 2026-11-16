import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { Logo } from './AuthLayout'
import { Spinner } from './ui'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg text-muted animate-fade-in">
        <Logo size={40} />
        <Spinner size={18} label="Loading NovaChat" />
      </div>
    )
  return user ? <Outlet key={user.id} /> : <Navigate to="/login" replace />
}
