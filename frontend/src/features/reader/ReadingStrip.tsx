import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import styles from './Reader.module.css'

type Props = {
  /** the citation number the sentences belong to */
  label: number
  /** the marked sentences found, in reading order: `index` is the sentence's place in the citation, `page` where it was found */
  sentences: { index: number; text: string; page: number }[]
  state: 'marks' | 'none-on-page' | 'no-sentence'
  /** the student moved to another sentence: the page scrolls to its mark */
  onShow(index: number): void
}

/**
 * Phones only: PDF text is small there, so the marked sentence is also shown here at reading size, under the pages.
 * The page above still shows where it is (the green margin bar); ‹ › move between the marked sentences.
 */
export function ReadingStrip({ label, sentences, state, onShow }: Props) {
  const [at, setAt] = useState(0)
  const current = sentences[Math.min(at, sentences.length - 1)]

  function move(to: number) {
    setAt(to)
    onShow(sentences[to].index)
  }

  if (state !== 'marks' || !current) {
    return (
      <section className={styles.strip} aria-label="Marked sentence">
        <p className={styles.stripNote}>
          {state === 'no-sentence'
            ? `No single sentence is marked for [${label}]: the chat card has the whole passage.`
            : 'Not found on this page: the sentence is marked in the chat card.'}
        </p>
      </section>
    )
  }

  const many = sentences.length > 1
  const place = Math.min(at, sentences.length - 1)
  return (
    <section className={styles.strip} aria-label="Marked sentence">
      <div className={styles.stripHead}>
        <span className={styles.stripLabel}>For [{label}]</span>
        <span>p. {current.page}</span>
        {many && <span>{place + 1} of {sentences.length}</span>}
        {many && (
          <span className={styles.stripButtons}>
            <button type="button" className={styles.stripButton} aria-label="Previous marked sentence" disabled={place === 0}
              onClick={() => move(place - 1)}><ChevronLeft size={22} aria-hidden="true" /></button>
            <button type="button" className={styles.stripButton} aria-label="Next marked sentence" disabled={place === sentences.length - 1}
              onClick={() => move(place + 1)}><ChevronRight size={22} aria-hidden="true" /></button>
          </span>
        )}
      </div>
      <p className={styles.stripText}><span className={styles.stripSentence}>{current.text}</span></p>
    </section>
  )
}
