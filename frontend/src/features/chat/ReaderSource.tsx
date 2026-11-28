import { claimsFor, supportForCitation } from '../../shared/evidence'
import styles from './Chat.module.css'
import { useConversation } from './hooks'
import { SourceCard } from './SourceCard'

type Props = {
  conversationId?: string; answerId?: string; n?: number
  /** the Reader could not mark all (or some) of the supporting sentences on the page */
  missingOnPage: 'all' | 'some' | null
}

const FALLBACK = 'Open a source from a chat to see it here.'

/**
 * The Reader's Source tab: the question, which claims of the answer this source supports, and the excerpt with its
 * marks (Back to chat is in the toolbar). A chat that is gone (or never existed) shows a fallback, never an error page.
 */
export function ReaderSource({ conversationId, answerId, n, missingOnPage }: Props) {
  const conversation = useConversation(conversationId)
  if (!conversationId || !answerId || n === undefined) return <p className={styles.hint}>{FALLBACK}</p>
  if (conversation.isPending) return <p className={styles.hint}>Loading…</p>

  const messages = conversation.data?.messages ?? []
  const at = messages.findIndex((m) => m.id === answerId && m.role === 'assistant')
  const answer = at >= 0 ? messages[at] : undefined
  const citation = answer?.citations.find((c) => c.n === n)
  if (!answer || !citation) return <p className={styles.hint}>{FALLBACK}</p>
  const question = messages.slice(0, at).reverse().find((m) => m.role === 'user')?.content

  // the same test the card uses, so the line shows exactly when the card has a mark, and the page has at least one:
  // with none on the page it would promise a green bar that is not there (final review F4)
  const explain = supportForCitation(answer.content, n, citation.excerpt).marks.length > 0 && missingOnPage !== 'all'

  return (
    <div className={styles.readerSource}>
      <h2 className={styles.panelTitle}>From your answer</h2>
      {question && <p className={styles.panelFor}>For: {question}</p>}
      <ul className={styles.claims}>
        {claimsFor(answer.content, n).map((claim, i) => <li key={i}>{claim}</li>)}
      </ul>
      {missingOnPage === 'all' && <p className={styles.notice}>Not found on this page: marked in the excerpt only.</p>}
      {missingOnPage === 'some' && <p className={styles.notice}>Not all of these are marked on the page: the excerpt below has every mark.</p>}
      {explain && (
        <p className={styles.markKey}>
          <span className={styles.markSwatch} aria-hidden="true" />
          <span>Green bar and underline: the sentence Ery used for [{n}].</span>
        </p>
      )}
      {/* no "Open page" (we are on it) and no second "Back to chat" (the toolbar has it) */}
      <SourceCard citation={citation} active={false} answer={answer} conversationId={conversationId} showOpenPage={false} />
    </div>
  )
}
