import { useEffect, useState } from 'react'
import { BreathingDot } from '../../shared/ui/BreathingDot'
import styles from './Chat.module.css'

/** While Ery answers (2-15 s, no streaming). After 5 s an honest line, so the screen never looks frozen. */
export function PendingAnswer({ slowAfterMs = 5000 }: { slowAfterMs?: number }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), slowAfterMs)
    return () => clearTimeout(t)
  }, [slowAfterMs])
  return (
    <div className={styles.pending} aria-live="polite">
      <p><BreathingDot /> Ery is reading your documents…</p>
      {slow && <p className={styles.hint}>Still working. Local models can take up to ~15 s.</p>}
    </div>
  )
}
