import type { ReactNode } from 'react'
import { AnswerMessage } from '../features/chat/AnswerMessage'
import { SourcesPanel } from '../features/chat/SourcesPanel'
import { UserMessage } from '../features/chat/UserMessage'
import type { ChatMessage, Citation } from '../features/chat/types'
import styles from './AuthLayout.module.css'

const SOURCE: Citation = {
  n: 1, chunk_id: null, document_id: 'example', filename: 'Vital signs, chapter 12.pdf', page: 112,
  excerpt: 'Normal adult blood pressure is a systolic reading below 120 mmHg and a diastolic reading below 80 mmHg.',
}
const ANSWER: ChatMessage = {
  id: 'example', role: 'assistant', refused: false, created_at: '', search_question: null, citations: [SOURCE],
  content: 'Normal adult blood pressure is a systolic reading below 120 mmHg and a diastolic reading below 80 mmHg [1].',
}

/**
 * Login, Register, Check inbox: the form beside a real Eryysyn answer (our own chat components, sample data),
 * so a first-time student sees what they get: an answer with the page to check.
 * `inert`: visible, but never focusable or clickable, and not part of the form for screen readers.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.layout}>
      <section className={styles.formSide}>
        <p className={styles.brand}>Eryysyn</p>
        <p className={styles.tagline}>Answers from your own study files, with the page to check.</p>
        {children}
      </section>
      <figure className={styles.preview} aria-label="Example of an Eryysyn answer" inert>
        <div className={styles.window}>
          <UserMessage text="What is a normal blood pressure for an adult?" searchQuestion={null} />
          <AnswerMessage message={ANSWER} onSelectCitation={() => {}} activeN={1} />
          <SourcesPanel citations={[SOURCE]} activeN={1} layout="inline" />
        </div>
        <figcaption className={styles.caption}>Example. Your answers come from the PDFs you upload.</figcaption>
      </figure>
    </main>
  )
}
