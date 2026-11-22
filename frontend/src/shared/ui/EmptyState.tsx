import type { ReactNode } from 'react'
import styles from './States.module.css'

/** Teaches the next step instead of saying "nothing here". */
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <section className={styles.state}>
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {action}
    </section>
  )
}
