/** What the backend's chat endpoints return (backend/app/api/conversations.py). */
export interface Citation {
  n: number                    // the [n] in the answer text
  chunk_id: string | null
  document_id: string | null   // null = the document was deleted ("Source removed")
  filename: string
  page: number
  excerpt: string              // the exact passage the model was shown
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  refused: boolean
  created_at: string
  search_question: string | null   // user messages: what was searched (null on answers and old messages)
  citations: Citation[]
}

export interface ConversationSummary { id: string; title: string | null; created_at: string }
export interface ConversationDetail extends ConversationSummary { instructions: string; messages: ChatMessage[] }

export interface SendResult {
  message_id: string
  answer: string
  refused: boolean
  search_question: string
  citations: Citation[]
}
