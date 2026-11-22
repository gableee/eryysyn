import { useId, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.css'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }

/** A labelled input. Hint and error are linked with aria-describedby, so screen readers read them. */
export function TextField({ label, hint, error, id, ...rest }: Props) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>{label}</label>
      <input
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {error && <p id={errorId} className={styles.error}>{error}</p>}
    </div>
  )
}
