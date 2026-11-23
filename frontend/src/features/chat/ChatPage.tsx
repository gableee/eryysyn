import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../shared/http'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ErrorState } from '../../shared/ui/ErrorState'
import styles from './Chat.module.css'
import { Composer } from './Composer'
import { useConversation, useCreateConversation, useDocumentsCheck, useLatestSend, useSend } from './hooks'
import { MessageList } from './MessageList'
import { PendingAnswer } from './PendingAnswer'
import { SourcesPanel } from './SourcesPanel'
import { UserMessage } from './UserMessage'
import { useSourcesLayout } from './useSourcesLayout'
import { useWorkspaceId } from '../../shared/workspace'

function sendError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'unavailable') return "Ery can't answer right now. The model isn't running."
  if (error instanceof ApiError && error.kind === 'network') return "Can't reach the server"
  return 'Something went wrong. Try again.'
}

export function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const conversation = useConversation(id)
  const hasDocuments = useDocumentsCheck().has
  const { workspaceId } = useWorkspaceId()
  const create = useCreateConversation()
  const send = useSend()
  const latest = useLatestSend(id)
  const [creating, setCreating] = useState<string | null>(null)   // the first question, while the chat is created
  const [createFailed, setCreateFailed] = useState<{ question: string; error: unknown } | null>(null)
  // A clicked citation belongs to ONE chat: the page stays mounted when you switch chats (one route),
  // so the selection remembers its chat and is ignored everywhere else.
  const [picked, setPicked] = useState<{ chatId: string | undefined; answerId: string; n?: number }>()
  const selection = picked && picked.chatId === id ? picked : undefined
  const area = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const layout = useSourcesLayout(area)

  const messages = conversation.data?.messages ?? []
  const pending = creating ?? (latest?.status === 'pending' ? latest.variables.question : null)
  const failed = latest?.status === 'error' ? latest : undefined
  const busy = pending !== null || create.isPending || !workspaceId   // no workspace yet: nowhere to send

  const answers = messages.filter((m) => m.role === 'assistant')
  // default: the newest answer that HAS sources (a refusal after it must not hide them)
  const selected = answers.find((m) => m.id === selection?.answerId)
    ?? [...answers].reverse().find((m) => m.citations.length > 0) ?? answers.at(-1)

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [messages.length, pending, failed])

  async function ask(question: string) {
    if (busy) return                                   // never two requests for one chat
    let conversationId = id
    if (!conversationId) {
      setCreating(question)
      setCreateFailed(null)
      try {
        conversationId = (await create.mutateAsync()).id
      } catch (error) {
        setCreating(null)
        setCreateFailed({ question, error })      // keep the question: Try again resends it
        return
      }
      navigate(`/chat/${conversationId}`, { replace: true })
      setCreating(null)
    }
    send.mutate({ conversationId, question })
  }

  if (conversation.error instanceof ApiError && conversation.error.kind === 'not_found') {
    return (
      <section className={styles.chat}>
        <EmptyState title="This chat no longer exists" action={<Link to="/chat" className={styles.linkButton}>New chat</Link>} />
      </section>
    )
  }

  const empty = !id && !pending && !createFailed && messages.length === 0
  const showPanel = layout === 'panel' && !!selected && selected.citations.length > 0
  return (
    // two columns only when there are sources to show; otherwise the chat is centred
    <section className={[styles.chat, showPanel && styles.withPanel].filter(Boolean).join(' ')} ref={area}>
      <div className={[styles.column, empty && styles.columnEmpty].filter(Boolean).join(' ')}>
        <header className={styles.chatHeader}>
          {/* while loading: an empty heading, never a wrong "Untitled chat" */}
          <h1 className={styles.chatTitle}>{!id ? 'New chat' : conversation.data ? (conversation.data.title ?? 'Untitled chat') : ''}</h1>
          <p className={styles.chatSub}>Answers come only from your documents.</p>
        </header>
        {empty && (
          <EmptyState title="Ask a question about your documents."
            body={hasDocuments === false ? 'Upload a PDF first' : 'Every answer shows the page it comes from.'}
            action={hasDocuments === false ? <Link to="/library" className={styles.linkButton}>Go to Library</Link> : undefined} />
        )}
        {conversation.isError && !(conversation.error instanceof ApiError && conversation.error.kind === 'not_found') && (
          <ErrorState message="This chat couldn't be loaded." onRetry={() => conversation.refetch()} />
        )}
        <MessageList messages={messages} layout={layout} selectedId={selected?.id}
          activeN={selection?.answerId === selected?.id ? selection?.n : undefined}
          onSelect={(answerId, n) => setPicked({ chatId: id, answerId, n })} />
        {pending && (<><UserMessage text={pending} searchQuestion={null} /><PendingAnswer /></>)}
        {failed && !pending && (
          <>
            <UserMessage text={failed.variables.question} searchQuestion={null} />
            <ErrorState message={sendError(failed.error)} onRetry={() => send.mutate(failed.variables)} />
          </>
        )}
        {!id && createFailed && !pending && (
          <>
            <UserMessage text={createFailed.question} searchQuestion={null} />
            <ErrorState message={sendError(createFailed.error)} onRetry={() => ask(createFailed.question)} />
          </>
        )}
        <div ref={end} />
        <div className={styles.composerDock}>
          <Composer onSend={ask} disabled={busy} />
        </div>
      </div>
      {showPanel && (
        <div className={styles.panelColumn} data-testid="sources">
          <SourcesPanel citations={selected.citations} activeN={selection?.answerId === selected.id ? selection.n : undefined} layout="panel" />
        </div>
      )}
    </section>
  )
}
