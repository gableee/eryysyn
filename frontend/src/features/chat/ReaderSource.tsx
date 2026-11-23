import { Link } from 'react-router'
import { claimsFor } from '../../shared/evidence'
import styles from './Chat.module.css'
import { useConversation } from './hooks'
import { SourceCard } from './SourceCard'

type Props = { conversationId?: string; answerId?: string; n?: number; highlightMissing: boolean }

const FALLBACK = 'Open a source from a chat to see it here.'

/**
 * The Reader's Source tab: which claims of the answer this source supports, the excerpt with its marks, and the
 * way back to the chat. A chat that is gone (or never existed) shows a fallback, never an error page.
 */
export function ReaderSource({ conversationId, answerId, n, highlightMissing }: Props) {
  const conversation = useConversation(conversationId)
  if (!conversationId || !answerId || n === undefined) return <p className={styles.hint}>{FALLBACK}</p>
  if (conversation.isPending) return <p className={styles.hint}>Loading…</p>

  const answer = conversation.data?.messages.find((m) => m.id === answerId && m.role === 'assistant')
  const citation = answer?.citations.find((c) => c.n === n)
  if (!answer || !citation) return <p className={styles.hint}>{FALLBACK}</p>

  return (
    <div className={styles.readerSource}>
      <h2 className={styles.panelTitle}>From your answer</h2>
      <ul className={styles.claims}>
        {claimsFor(answer.content, n).map((claim, i) => <li key={i}>{claim}</li>)}
      </ul>
      {highlightMissing && <p className={styles.notice}>Marked in the excerpt only</p>}
      <SourceCard citation={citation} active={false} answer={answer} conversationId={conversationId} showOpenPage={false} />
      <Link to={`/chat/${conversationId}`} className={styles.pageLink}>Back to chat</Link>
    </div>
  )
}
