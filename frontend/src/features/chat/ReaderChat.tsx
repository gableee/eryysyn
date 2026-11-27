import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../shared/http'
import { ErrorState } from '../../shared/ui/ErrorState'
import { useWorkspaceId } from '../../shared/workspace'
import styles from './Chat.module.css'
import { Composer } from './Composer'
import { useConversation, useCreateConversation, useLatestSend, useSend } from './hooks'
import { MessageList } from './MessageList'
import { PendingAnswer } from './PendingAnswer'
import { sendError } from './sendError'
import type { Citation } from './types'
import { UserMessage } from './UserMessage'

type Props = {
  conversationId?: string
  /** a citation was clicked: the Reader moves to its document and page */
  onOpenCitation(citation: Citation, answerId: string, n: number): void
  /** opened from the Library: the first question created this chat */
  onStarted(conversationId: string): void
  /** the document and page the Reader shows: its cards say "You are on this page" */
  here?: { documentId: string; page: number }
}

/**
 * The Reader's Chat tab: the conversation the student came from, next to the page, with the same question box
 * and send logic as the chat page. Opened from the Library, the first question starts a new chat.
 */
export function ReaderChat({ conversationId, onOpenCitation, onStarted, here }: Props) {
  const conversation = useConversation(conversationId)
  // a chat that was deleted, or is not yours (404): treated as no chat, so the first question starts a new one
  // and replaces the dead id in the address (final review: every question failed against the dead id)
  const gone = conversation.error instanceof ApiError && conversation.error.kind === 'not_found'
  const chatId = gone ? undefined : conversationId
  const send = useSend()
  const create = useCreateConversation()
  const latest = useLatestSend(conversationId)
  const { workspaceId } = useWorkspaceId()
  const [creating, setCreating] = useState<string | null>(null)
  const [createFailed, setCreateFailed] = useState<unknown>(null)

  const messages = conversation.data?.messages ?? []
  const pending = creating ?? (latest?.status === 'pending' ? latest.variables.question : null)
  const failed = latest?.status === 'error' ? latest : undefined
  const busy = pending !== null || create.isPending || !workspaceId
  const end = useRef<HTMLDivElement>(null)

  // the newest message comes into view (the panel scrolls, not the page)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [messages.length, pending, failed])

  async function ask(question: string) {
    if (busy) return
    let id = chatId
    if (!id) {
      setCreating(question)
      setCreateFailed(null)
      try {
        id = (await create.mutateAsync()).id
      } catch (error) {
        setCreating(null)
        setCreateFailed(error)
        return
      }
      onStarted(id)
      setCreating(null)
    }
    send.mutate({ conversationId: id, question })
  }

  return (
    <div className={styles.readerChat}>
      {messages.length === 0 && !pending && <p className={styles.hint}>Ask a question about your documents.</p>}
      <MessageList messages={messages} layout="inline" selectedId={undefined} activeN={undefined} conversationId={chatId} here={here}
        onSelect={(answerId, n) => {
          const citation = messages.find((m) => m.id === answerId)?.citations.find((c) => c.n === n)
          if (citation?.document_id) onOpenCitation(citation, answerId, n)
        }} />
      {pending && (<><UserMessage text={pending} searchQuestion={null} /><PendingAnswer /></>)}
      {failed && !pending && <ErrorState message={sendError(failed.error)} onRetry={() => send.mutate(failed.variables)} />}
      {createFailed !== null && !pending && <ErrorState message={sendError(createFailed)} />}
      <div ref={end} data-end="chat" />
      <div className={styles.readerComposer}><Composer onSend={ask} disabled={busy} /></div>
    </div>
  )
}
