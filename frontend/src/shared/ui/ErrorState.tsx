import { CircleAlert } from 'lucide-react'
import { Button } from './Button'
import styles from './States.module.css'

/** role="alert": screen readers announce it the moment it appears. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?(): void }) {
  return (
    <div className={styles.error} role="alert">
      <CircleAlert size={20} aria-hidden="true" className={styles.icon} />
      <p className={styles.body}>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
