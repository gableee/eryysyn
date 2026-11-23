import type { ReactNode } from 'react'
import styles from './Library.module.css'

/** First visit: what Eryysyn does, the upload zone as the only action, and what comes next. */
export function EmptyLibrary({ upload }: { upload: ReactNode }) {
  return (
    <section className={styles.empty}>
      <p className={styles.lead}>
        Upload your course PDFs. Eryysyn answers questions from them and shows the page each answer comes from.
      </p>
      {upload}
      <p className={styles.next}>After uploading, ask questions in Chat.</p>
    </section>
  )
}
