import { ChevronDown } from 'lucide-react'
import { useEffect, useRef } from 'react'
import styles from './Chat.module.css'
import { SourceCard } from './SourceCard'
import type { ChatMessage, Citation } from './types'

type Props = {
  citations: Citation[]; activeN: number | undefined; layout: 'panel' | 'inline'
  /** panel only: the question these sources answer, and whether it is an earlier one (e.g. after a refusal) */
  question?: string; earlier?: boolean
  /** the answer these sources belong to (marks + "Open page"), and which of its claims was clicked */
  answer?: ChatMessage; conversationId?: string; activeClaim?: number
}

const NOTICE = 'Check the cited page before relying on an answer.'

/** Sources of one answer. "panel" beside the chat on wide screens, "inline" under the answer otherwise. */
export function SourcesPanel({ citations, activeN, layout, question, earlier = false, answer, conversationId, activeClaim }: Props) {
  const refs = useRef(new Map<number, HTMLElement>())
  // Scroll only when the reader PICKS a citation, never on first display: the login example shows a highlighted
  // card, and scrolling to it pulled the phone login page away from the form.
  const shown = useRef(`${activeN}:${activeClaim}`)
  useEffect(() => {
    const now = `${activeN}:${activeClaim}`
    if (activeN !== undefined && now !== shown.current) {
      // the clicked claim's own mark if it has one, else the card
      const card = refs.current.get(activeN)
      const mark = activeClaim === undefined ? null : card?.querySelector(`mark[data-claim~="${activeClaim}"]`)
      ;(mark ?? card)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
    shown.current = now
  }, [activeN, activeClaim])

  const cards = citations.map((c) => (
    <SourceCard key={c.n} citation={c} active={c.n === activeN} answer={answer} conversationId={conversationId}
      ref={(el) => { if (el) refs.current.set(c.n, el); else refs.current.delete(c.n) }} />
  ))

  if (layout === 'inline') {
    return (
      <details className={styles.inlineSources} open>
        <summary>Sources ({citations.length}) <ChevronDown size={16} aria-hidden="true" className={styles.chevron} /></summary>
        <p className={styles.notice}>{NOTICE}</p>
        <div className={styles.cards}>{cards}</div>
      </details>
    )
  }
  return (
    <aside className={styles.panel} aria-label="Sources">
      <h2 className={styles.panelTitle}>Sources</h2>
      {/* the panel sits far from the answer: say which question its evidence belongs to */}
      {question && <p className={styles.panelFor}>{earlier ? 'From your earlier question: ' : 'For: '}{question}</p>}
      <p className={styles.notice}>{NOTICE}</p>
      <div className={styles.cards}>{cards}</div>
    </aside>
  )
}
