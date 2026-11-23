import { useQuery } from '@tanstack/react-query'
import { getFileUrl } from './api'

/** The link lives only in memory, and is treated as stale before it expires (10 min on the server). */
export function useFileUrl(id: string) {
  return useQuery({
    queryKey: ['file-url', id],
    queryFn: () => getFileUrl(id),
    staleTime: 8 * 60_000,
    gcTime: 9 * 60_000,
  })
}
