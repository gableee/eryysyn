import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import styles from './Reader.module.css'

type Props = {
  /** the citation number the sentences belong to */
  label: number
  /** the marked sentences found, in reading order: `index` is the sentence's place in the citation, `page` where it was found */
  sentences: { index: number; text: string; page: number }[]
  state: 'marks' | 'none-on-page' | 'no-sentence'
  /** the student moved to another sentence: the page scrolls to its mark */
  onShow(index: number): void
  /** a tap on the page put the strip away: it stays mounted (hidden), so it comes back on the same sentence */
  hidden?: boolean
}

/**
 * Phones only: PDF text is small there, so the marked sentence is also shown here at reading size, under the pages.
 * The page above still shows where it is (the green margin bar); ‹ › move between the marked sentences.
 */
export function ReadingStrip({ label, sentences, state, onShow, hidden = false }: Props) {
  const [at, setAt] = useState(0)
  const current = sentences[Math.min(at, sentences.length - 1)]
  const previous = useRef<HTMLButtonElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  // the arrow that should take focus after this step, because the focused one is now disabled (first or last sentence)
  const handOff = useRef<HTMLButtonElement | null>(null)

  function move(to: number) {
    setAt(to)
    onShow(sentences[to].index)
    // a disabled button loses focus (to the page body: screen-reader users lose their place), so hand it to the other
    // arrow. Only when an arrow had focus: a tap on a phone does not focus the button, and must not show a focus ring.
    const focused = document.activeElement
    if (focused === next.current && to === sentences.length - 1) handOff.current = previous.current
    else if (focused === previous.current && to === 0) handOff.current = next.current
  }

  // after the render that disabled the focused arrow (the other one is enabled by then)
  useEffect(() => {
    handOff.current?.focus()
    handOff.current = null
  })

  if (state !== 'marks' || !current) {
    return (
      <section className={styles.strip} aria-label="Marked sentence" hidden={hidden}>
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
    <section className={styles.strip} aria-label="Marked sentence" hidden={hidden}>
      <div className={styles.stripHead}>
        <span className={styles.stripLabel}>For [{label}]</span>
        <span>p. {current.page}</span>
        {many && <span>{place + 1} of {sentences.length}</span>}
        {many && (
          <span className={styles.stripButtons}>
            <button type="button" className={styles.stripButton} aria-label="Previous marked sentence" disabled={place === 0} ref={previous}
              onClick={() => move(place - 1)}><ChevronLeft size={22} aria-hidden="true" /></button>
            <button type="button" className={styles.stripButton} aria-label="Next marked sentence" disabled={place === sentences.length - 1} ref={next}
              onClick={() => move(place + 1)}><ChevronRight size={22} aria-hidden="true" /></button>
          </span>
        )}
      </div>
      <p className={styles.stripText}><span className={styles.stripSentence}>{current.text}</span></p>
    </section>
  )
}
