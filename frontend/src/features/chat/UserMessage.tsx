import styles from './Chat.module.css'
import { showSearchedFor } from './searchedFor'

/** Your question, and what Ery actually searched for when it rewrote a follow-up. */
export function UserMessage({ text, searchQuestion }: { text: string; searchQuestion: string | null }) {
  return (
    <div className={styles.user}>
      <p className={styles.bubble}>{text}</p>
      {showSearchedFor(text, searchQuestion) && <p className={styles.searched}>Searched for: {searchQuestion}</p>}
    </div>
  )
}
