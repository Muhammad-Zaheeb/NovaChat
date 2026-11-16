import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../store/auth'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">
        Loading…
      </div>
    )
  return user ? <Outlet key={user.id} /> : <Navigate to="/login" replace />
}
