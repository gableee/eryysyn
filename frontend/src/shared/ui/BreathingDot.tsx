import styles from './BreathingDot.module.css'

/** A calm "working" signal instead of a spinner. Decorative: the text next to it carries the meaning. */
export function BreathingDot() {
  return <span className={styles.dot} aria-hidden="true" />
}
