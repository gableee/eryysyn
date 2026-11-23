import { forwardRef, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { supportForCitation } from '../../shared/evidence'
import { readerPath } from '../../shared/readerPath'
import styles from './Chat.module.css'
import type { ChatMessage, Citation } from './types'

type Props = {
  citation: Citation
  active: boolean
  /** the answer citing this source: enables the marks and "Open page" */
  answer?: ChatMessage
  conversationId?: string
  /** false inside the Reader: we are on that page already */
  showOpenPage?: boolean
  /** the Reader's current document and page: a card for it says so instead of linking to it */
  here?: { documentId: string; page: number }
}

/**
 * One source: number, file, page and the exact excerpt the answer was based on. With the answer, the sentences
 * that support it are marked (`<mark data-claim="0 2">`: the claims of the answer they support) and the excerpt
 * starts at the first one. Text stays text: marks wrap plain text, never HTML.
 */
export const SourceCard = forwardRef<HTMLElement, Props>(function SourceCard({ citation, active, answer, conversationId, showOpenPage = true, here }, ref) {
  const removed = citation.document_id === null
  const isHere = !!here && here.documentId === citation.document_id && here.page === citation.page
  const support = useMemo(
    () => (answer ? supportForCitation(answer.content, citation.n, citation.excerpt) : null),
    [answer, citation.n, citation.excerpt],
  )
  const [whole, setWhole] = useState(false)
  const marked = support && support.marks.length > 0 ? support : null
  const from = marked && !whole ? marked.marks[0].index : 0

  return (
    <article ref={ref} className={[styles.card, active && styles.cardActive].filter(Boolean).join(' ')}
      aria-label={`Source ${citation.n}`}>
      <header className={styles.cardHead}>
        <span className={styles.cardNumber} aria-hidden="true">{citation.n}</span>
        <span className={styles.cardFile}>{citation.filename}</span>
        <span className={styles.cardPage}>p. {citation.page}</span>
      </header>
      {removed && <p className={styles.removed}>Source removed</p>}
      <blockquote className={styles.excerpt}>
        {marked ? marked.sentences.slice(from).map((sentence, i) => {
          const mark = marked.marks.find((m) => m.index === from + i)
          return (
            <span key={from + i}>
              {i > 0 && ' '}
              {mark ? <mark className={styles.evidence} data-claim={mark.claims.join(' ')}>{sentence}</mark> : sentence}
            </span>
          )
        }) : citation.excerpt}
      </blockquote>
      {(marked || (answer && !removed && showOpenPage)) && (
        <div className={styles.cardActions}>
          {marked && marked.marks[0].index > 0 && (
            <button type="button" className={styles.textButton} onClick={() => setWhole(!whole)}>
              {whole ? 'Show less' : 'Show whole passage'}
            </button>
          )}
          {answer && !removed && showOpenPage && isHere && <span className={styles.here}>You are on this page</span>}
          {answer && !removed && showOpenPage && !isHere && (
            <Link className={styles.pageLink}
              to={readerPath({ documentId: citation.document_id!, page: citation.page, chat: conversationId, answer: answer.id, n: citation.n })}>
              Open page {citation.page}
            </Link>
          )}
        </div>
      )}
    </article>
  )
})
