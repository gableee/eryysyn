import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../features/auth/useSession'

/** Pages that need a login. While Supabase reads the stored session, show nothing (no flash of login). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  const location = useLocation()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

/** Login, Register, Check inbox: a logged-in user goes straight into the app. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return children
}
