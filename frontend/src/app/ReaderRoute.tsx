import { lazy, Suspense, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useConversation } from '../features/chat/hooks'
import { ReaderChat } from '../features/chat/ReaderChat'
import { ReaderSource } from '../features/chat/ReaderSource'
import { useDocuments } from '../features/library/hooks'
import type { ReaderBack } from '../features/reader/ReaderPage'
import { supportForCitation } from '../shared/evidence'
import { ApiError } from '../shared/http'
import { readerPath } from '../shared/readerPath'

// PDF.js is large: the Reader's code is downloaded only when a Reader opens (route code-splitting).
const ReaderPage = lazy(() => import('../features/reader/ReaderPage').then((m) => ({ default: m.ReaderPage })))

/**
 * `/documents/:id?page=&chat=&answer=&n=`: app/ composes the features here (the Reader never imports Chat or
 * Library). From a citation it knows the answer, so it can mark the supporting sentences on the page.
 */
export function ReaderRoute() {
  const { id = '' } = useParams()
  const [query, setQuery] = useSearchParams()
  const navigate = useNavigate()
  const chat = query.get('chat') ?? undefined
  const answerId = query.get('answer') ?? undefined
  const n = Number(query.get('n')) || undefined
  const page = Math.max(1, Math.floor(Number(query.get('page'))) || 1)   // the exact clamp to the last page is the view's job

  const conversation = useConversation(chat)
  const documents = useDocuments()
  const answer = conversation.data?.messages.find((m) => m.id === answerId && m.role === 'assistant')
  const citation = answer?.citations.find((c) => c.n === n)
  const highlights = useMemo(() => {
    if (!answer || !citation || n === undefined) return []
    const support = supportForCitation(answer.content, n, citation.excerpt)
    return support.marks.map((m) => support.sentences[m.index])
  }, [answer, citation, n])

  const filename = citation?.filename ?? documents.data?.find((d) => d.id === id)?.filename
  // a chat that is gone or not yours is no place to go back to (the Chat tab starts a new one)
  const chatGone = conversation.error instanceof ApiError && conversation.error.kind === 'not_found'
  const back: ReaderBack = chat && !chatGone ? { to: `/chat/${chat}`, label: 'Back to chat' } : { to: '/library', label: 'Back to Library' }

  return (
    <Suspense fallback={<p role="status">Opening the Reader…</p>}>
      <ReaderPage documentId={id} filename={filename} page={page} highlights={highlights} label={citation ? n : undefined} back={back}
        defaultTab={answerId ? 'source' : 'chat'}
        source={({ missingOnPage }) => (
          <ReaderSource conversationId={chat} answerId={answerId} n={n} missingOnPage={missingOnPage} />
        )}
        chat={
          <ReaderChat conversationId={chat} here={{ documentId: id, page }}
            // a citation in the Chat tab moves the Reader to its document and page (same route, new address)
            onOpenCitation={(c, answer, cn) => navigate(readerPath({ documentId: c.document_id!, page: c.page, chat, answer, n: cn }))}
            // opened from the Library: the first question created a chat; remember it in the address
            onStarted={(newChat) => setQuery((q) => { q.set('chat', newChat); return q }, { replace: true })} />
        } />
    </Suspense>
  )
}
