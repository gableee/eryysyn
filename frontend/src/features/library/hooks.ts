import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceId } from '../../shared/workspace'
import { deleteDocument, listDocuments, retryDocument, uploadDocument } from './api'
import type { LibraryDocument } from './types'

/** Other features read this key (Chat checks "is the library empty?"). */
export const documentsKey = (ws: string | undefined) => ['documents', ws] as const

/** The backend lists a document as "uploaded" while it reads it (that can take a minute). Only an old one is stuck
 *  (server restarted mid-reading): a recent one may be reading right now, from a reload or another tab, and
 *  "Try again" would start a second reading of the same document at the same time. */
export const READING_WINDOW_MS = 10 * 60_000
export const isStillReading = (d: LibraryDocument, now = Date.now()) =>
  d.status === 'uploaded' && now - Date.parse(d.created_at) < READING_WINDOW_MS

export function useDocuments() {
  const { workspaceId } = useWorkspaceId()
  return useQuery({
    queryKey: documentsKey(workspaceId),
    queryFn: () => listDocuments(workspaceId!),
    enabled: !!workspaceId,
    // while something is being read, look again every 5 s so it turns Ready on its own
    refetchInterval: (query) => (query.state.data?.some((d) => isStillReading(d)) ? 5000 : false),
  })
}

/** Every change refreshes the list, so the screen shows what the backend really stored. */
function useDocumentMutation<V, R>(fn: (ws: string, v: V) => Promise<R>, mutationKey?: readonly unknown[]) {
  const { workspaceId } = useWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey,
    mutationFn: (v: V) => {
      // A disabled control is not enough: never send "/workspaces/undefined/…"
      if (!workspaceId) return Promise.reject(new Error('Your workspace is still loading. Try again in a moment.'))
      return fn(workspaceId, v)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: documentsKey(workspaceId) }),
  })
}

const UPLOAD = ['upload'] as const
export const useUpload = () => useDocumentMutation((ws, file: File) => uploadDocument(ws, file), UPLOAD)

/** Names of the files still uploading in this tab. Kept by the query client, not by the page, so they survive
 *  leaving the Library and coming back (the request keeps running meanwhile). */
export function useRunningUploads(): string[] {
  return useMutationState({ filters: { mutationKey: UPLOAD, status: 'pending' }, select: (m) => (m.state.variables as File).name })
}
export const useRetry = () => useDocumentMutation((_ws, id: string) => retryDocument(id))
export const useDelete = () => useDocumentMutation((_ws, id: string) => deleteDocument(id))
