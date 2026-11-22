import { forwardRef } from 'react'
import styles from './Chat.module.css'
import type { Citation } from './types'

type Props = { citation: Citation; active: boolean }

/** One source: number, file, page and the exact excerpt the answer was based on. */
export const SourceCard = forwardRef<HTMLElement, Props>(function SourceCard({ citation, active }, ref) {
  const removed = citation.document_id === null
  return (
    <article ref={ref} className={[styles.card, active && styles.cardActive].filter(Boolean).join(' ')}
      aria-label={`Source ${citation.n}`}>
      <header className={styles.cardHead}>
        <span className={styles.cardNumber} aria-hidden="true">{citation.n}</span>
        <span className={styles.cardFile}>{citation.filename}</span>
        <span className={styles.cardPage}>p. {citation.page}</span>
      </header>
      {removed && <p className={styles.removed}>Source removed</p>}
      <blockquote className={styles.excerpt}>{citation.excerpt}</blockquote>
    </article>
  )
})
