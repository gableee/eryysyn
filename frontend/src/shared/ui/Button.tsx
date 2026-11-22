import type { ComponentProps } from 'react'
import styles from './Button.module.css'

type Props = ComponentProps<'button'> & {   // includes ref (React 19: ref is a normal prop)
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  busy?: boolean   // waiting for the server: disabled, and screen readers hear "busy"
}

/** One primary button per screen (design rule); the rest are secondary or quiet. */
export function Button({ variant = 'secondary', busy = false, disabled, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    />
  )
}
