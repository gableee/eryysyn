import styles from './Chat.module.css'
import type { Citation } from './types'

/** A small numbered button after a claim. Screen readers hear the source, not just "1". */
export function CitationMarker({ citation, active, onSelect }: { citation: Citation; active: boolean; onSelect(): void }) {
  return (
    <button type="button" className={[styles.marker, active && styles.markerActive].filter(Boolean).join(' ')}
      aria-label={`Source ${citation.n}, ${citation.filename} page ${citation.page}`} aria-pressed={active}
      onClick={onSelect}>
      {citation.n}
    </button>
  )
}
