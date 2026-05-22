import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../lib/useSession'
import { PageSpinner } from './ui/PageSpinner'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.status === 'loading') return <PageSpinner />
  if (session.status === 'anonymous') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
