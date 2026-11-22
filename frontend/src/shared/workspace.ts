import { useQuery } from '@tanstack/react-query'
import { ApiError, http } from './http'

type Workspace = { id: string; name: string }

/** The user's workspace id. The first GET /workspaces creates the hidden "Personal" one. */
export function useWorkspaceId(): { workspaceId: string | undefined; isLoading: boolean; error: ApiError | null } {
  const q = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => http<Workspace[]>('/workspaces'),
    staleTime: Infinity, // it never changes during a session
  })
  return { workspaceId: q.data?.[0]?.id, isLoading: q.isLoading, error: (q.error as ApiError | null) ?? null }
}
