import { useMutation, useMutationState, useQuery, useQueryClient, type Mutation } from '@tanstack/react-query'
import { ApiError } from '../../shared/http'
import { useWorkspaceId } from '../../shared/workspace'
import { createConversation, getConversation, listConversations, listDocuments, sendMessage } from './api'
import type { ChatMessage, ConversationDetail, SendResult } from './types'

export const conversationsKey = (ws: string | undefined) => ['conversations', ws] as const
export const conversationKey = (id: string | undefined) => ['conversation', id] as const
const SEND = ['send'] as const

export type SendVars = { conversationId: string; question: string }

export function useConversations() {
  const { workspaceId } = useWorkspaceId()
  return useQuery({ queryKey: conversationsKey(workspaceId), queryFn: () => listConversations(workspaceId!), enabled: !!workspaceId })
}

export function useConversation(id: string | undefined) {
  return useQuery({ queryKey: conversationKey(id), queryFn: () => getConversation(id!), enabled: !!id })
}

/** Is there any document? `has` is undefined until known. Shares the Library's cache entry (same key and endpoint). */
export function useDocumentsCheck() {
  const { workspaceId } = useWorkspaceId()
  const q = useQuery({ queryKey: ['documents', workspaceId], queryFn: () => listDocuments(workspaceId!), enabled: !!workspaceId })
  return { has: q.data ? q.data.length > 0 : undefined, error: q.error as ApiError | null, retry: () => q.refetch() }
}

export function useCreateConversation() {
  const { workspaceId } = useWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createConversation(workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey(workspaceId) }),
  })
}

/**
 * Sending a question. The result is written into the chat's cache in onSuccess here (not in the page),
 * so an answer that arrives after the user went to another page is still there when they come back.
 */
export function useSend() {
  const { workspaceId } = useWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SEND,
    mutationFn: ({ conversationId, question }: SendVars) => sendMessage(conversationId, question),
    onSuccess: (r: SendResult, { conversationId, question }: SendVars) => {
      const now = new Date().toISOString()
      const added: ChatMessage[] = [
        { id: `local-q-${r.message_id}`, role: 'user', content: question, refused: false, created_at: now, search_question: r.search_question, citations: [] },
        { id: r.message_id, role: 'assistant', content: r.answer, refused: r.refused, created_at: now, search_question: null, citations: r.citations },
      ]
      queryClient.setQueryData<ConversationDetail>(conversationKey(conversationId),
        (old) => (old ? { ...old, messages: [...old.messages, ...added] } : old))
      void queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })   // then the server's truth
      void queryClient.invalidateQueries({ queryKey: conversationsKey(workspaceId) })      // a new title
    },
  })
}

/** The newest send for this chat, wherever it was started: pending, failed or done. */
export function useLatestSend(conversationId: string | undefined) {
  const sends = useMutationState({
    filters: { mutationKey: SEND, predicate: (m: Mutation) => (m.state.variables as SendVars | undefined)?.conversationId === conversationId },
    select: (m) => ({
      status: m.state.status, variables: m.state.variables as SendVars, error: m.state.error as ApiError | null, at: m.state.submittedAt,
    }),
  })
  return conversationId ? sends.sort((a, b) => a.at - b.at).at(-1) : undefined
}
