import { Fragment, type ReactNode } from 'react'
import styles from './Chat.module.css'
import { CitationMarker } from './CitationMarker'
import { parseCitations } from './parseCitations'
import type { ChatMessage } from './types'

type Props = { message: ChatMessage; onSelectCitation(n: number): void; activeN?: number }

/** Ery's answer. Text and citation buttons only (never HTML). */
export function AnswerMessage({ message, onSelectCitation, activeN }: Props) {
  if (message.refused) {
    return (
      <div className={styles.answer}>
        <p className={styles.refusal}>Not found in your documents.</p>
        <p className={styles.hint}>Try other words, or check the document is in your Library.</p>
      </div>
    )
  }
  const byN = new Map(message.citations.map((c) => [c.n, c]))
  const paragraphs = parseCitations(message.content, [...byN.keys()])
  return (
    <div className={styles.answer}>
      {paragraphs.map((segments, i) => <p key={i}>{renderParagraph(segments)}</p>)}
    </div>
  )

  /**
   * The word right before a marker and the marker go into one no-wrap span, so a citation can never
   * wrap onto a line of its own ("…liable" | "[1]" on the next line).
   */
  function renderParagraph(segments: ReturnType<typeof parseCitations>[number]): ReactNode[] {
    const nodes: ReactNode[] = []
    let glue: ReactNode[] | null = null
    segments.forEach((s, i) => {
      if (s.kind === 'text') {
        if (glue) { nodes.push(<span key={`g${i}`} className={styles.glue}>{glue}</span>); glue = null }
        nodes.push(<Fragment key={i}>{s.text}</Fragment>)
        return
      }
      if (!glue) {
        const prev = nodes.pop()
        const text = typeof prev === 'object' && prev && 'props' in prev ? String((prev as { props: { children: string } }).props.children) : ''
        const cut = text.replace(/\s+$/, '').search(/\S+$/)
        const head = cut > 0 ? text.slice(0, cut) : ''
        const word = cut >= 0 ? text.slice(cut).replace(/\s+$/, '') : ''
        if (head) nodes.push(<Fragment key={`h${i}`}>{head}</Fragment>)
        glue = word ? [<Fragment key={`w${i}`}>{word}{' '}</Fragment>] : []
      }
      glue.push(<CitationMarker key={`c${i}`} citation={byN.get(s.n)!} active={activeN === s.n}
        onSelect={() => onSelectCitation(s.n)} />)
    })
    if (glue) nodes.push(<span key="g-end" className={styles.glue}>{glue}</span>)
    return nodes
  }
}
