/** The ONLY file in the Chat feature that knows backend URLs (backend/app/api/conversations.py). */
import { http } from '../../shared/http'
import type { ConversationDetail, ConversationSummary, SendResult } from './types'

const json = (body: unknown): RequestInit => ({
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
})

export const listConversations = (ws: string) => http<ConversationSummary[]>(`/workspaces/${ws}/conversations`)
export const getConversation = (id: string) => http<ConversationDetail>(`/conversations/${id}`)
export const createConversation = (ws: string) => http<ConversationSummary>(`/workspaces/${ws}/conversations`, json({}))
/** Slow: the backend may rewrite a follow-up, then search and ask the model (2-15 s). */
export const sendMessage = (id: string, question: string) => http<SendResult>(`/conversations/${id}/messages`, json({ question }))
/** Same endpoint and cache key as the Library's list: Chat only asks "is there any document?" */
export const listDocuments = (ws: string) => http<{ id: string }[]>(`/workspaces/${ws}/documents`)
