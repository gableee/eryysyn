import { ChevronDown } from 'lucide-react'
import { useEffect, useRef } from 'react'
import styles from './Chat.module.css'
import { SourceCard } from './SourceCard'
import type { Citation } from './types'

type Props = { citations: Citation[]; activeN: number | undefined; layout: 'panel' | 'inline' }

const NOTICE = 'Check the cited page before relying on an answer.'

/** Sources of one answer. "panel" beside the chat on wide screens, "inline" under the answer otherwise. */
export function SourcesPanel({ citations, activeN, layout }: Props) {
  const refs = useRef(new Map<number, HTMLElement>())
  // Scroll only when the reader PICKS a citation, never on first display: the login example shows a highlighted
  // card, and scrolling to it pulled the phone login page away from the form.
  const shown = useRef(activeN)
  useEffect(() => {
    if (activeN !== undefined && activeN !== shown.current) {
      refs.current.get(activeN)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
    shown.current = activeN
  }, [activeN])

  const cards = citations.map((c) => (
    <SourceCard key={c.n} citation={c} active={c.n === activeN}
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
      <p className={styles.notice}>{NOTICE}</p>
      <div className={styles.cards}>{cards}</div>
    </aside>
  )
}
