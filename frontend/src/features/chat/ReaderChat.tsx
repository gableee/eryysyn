import { useState } from 'react'
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
}

/**
 * The Reader's Chat tab: the conversation the student came from, next to the page, with the same question box
 * and send logic as the chat page. Opened from the Library, the first question starts a new chat.
 */
export function ReaderChat({ conversationId, onOpenCitation, onStarted }: Props) {
  const conversation = useConversation(conversationId)
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

  async function ask(question: string) {
    if (busy) return
    let id = conversationId
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
      <MessageList messages={messages} layout="inline" selectedId={undefined} activeN={undefined} conversationId={conversationId}
        onSelect={(answerId, n) => {
          const citation = messages.find((m) => m.id === answerId)?.citations.find((c) => c.n === n)
          if (citation?.document_id) onOpenCitation(citation, answerId, n)
        }} />
      {pending && (<><UserMessage text={pending} searchQuestion={null} /><PendingAnswer /></>)}
      {failed && !pending && <ErrorState message={sendError(failed.error)} onRetry={() => send.mutate(failed.variables)} />}
      {createFailed !== null && !pending && <ErrorState message={sendError(createFailed)} />}
      <div className={styles.readerComposer}><Composer onSend={ask} disabled={busy} /></div>
    </div>
  )
}
