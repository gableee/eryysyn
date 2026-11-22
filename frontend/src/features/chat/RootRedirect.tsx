import { Navigate } from 'react-router'
import { useHasDocuments } from './hooks'

/** "/" : a new user with no documents starts in the Library; everyone else in Chat. */
export function RootRedirect() {
  const has = useHasDocuments()
  if (has === undefined) return null
  return <Navigate to={has ? '/chat' : '/library'} replace />
}
