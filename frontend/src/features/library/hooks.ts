import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceId } from '../../shared/workspace'
import { deleteDocument, listDocuments, retryDocument, uploadDocument } from './api'

/** Other features read this key (Chat checks "is the library empty?"). */
export const documentsKey = (ws: string | undefined) => ['documents', ws] as const

export function useDocuments() {
  const { workspaceId } = useWorkspaceId()
  return useQuery({
    queryKey: documentsKey(workspaceId),
    queryFn: () => listDocuments(workspaceId!),
    enabled: !!workspaceId,
  })
}

/** Every change refreshes the list, so the screen shows what the backend really stored. */
function useDocumentMutation<V, R>(fn: (ws: string, v: V) => Promise<R>) {
  const { workspaceId } = useWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: V) => {
      // A disabled control is not enough: never send "/workspaces/undefined/…"
      if (!workspaceId) return Promise.reject(new Error('Your workspace is still loading. Try again in a moment.'))
      return fn(workspaceId, v)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: documentsKey(workspaceId) }),
  })
}

export const useUpload = () => useDocumentMutation((ws, file: File) => uploadDocument(ws, file))
export const useRetry = () => useDocumentMutation((_ws, id: string) => retryDocument(id))
export const useDelete = () => useDocumentMutation((_ws, id: string) => deleteDocument(id))
