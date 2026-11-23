import { Navigate } from 'react-router'
import { ApiError } from '../../shared/http'
import { ErrorState } from '../../shared/ui/ErrorState'
import { useDocumentsCheck } from './hooks'

/** "/" : a new user with no documents starts in the Library; everyone else in Chat. Never a blank page. */
export function RootRedirect() {
  const { has, error, retry } = useDocumentsCheck()
  if (error) {
    return (
      <ErrorState onRetry={retry}
        message={error instanceof ApiError && error.kind === 'network' ? "Can't reach the server" : "Your documents couldn't be checked."} />
    )
  }
  if (has === undefined) return null
  return <Navigate to={has ? '/chat' : '/library'} replace />
}
