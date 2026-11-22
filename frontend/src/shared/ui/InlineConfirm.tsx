import { useEffect, useRef } from 'react'
import { Button } from './Button'
import styles from './InlineConfirm.module.css'

type Props = { question: string; confirmLabel: string; onConfirm(): void; onCancel(): void }

/**
 * Asks inside the row instead of a pop-up modal. Cancel gets focus first (the safe choice),
 * Escape cancels. Two deliberate clicks also make clickjacking harder.
 */
export function InlineConfirm({ question, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancelRef.current?.focus() }, [])
  return (
    <div className={styles.confirm} role="group" aria-label={question}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <span className={styles.question}>{question}</span>
      <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      <Button variant="quiet" ref={cancelRef} onClick={onCancel}>Cancel</Button>
    </div>
  )
}
