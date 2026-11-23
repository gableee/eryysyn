import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './IconButton.module.css'

type Props = ComponentProps<'button'> & { label: string; icon: LucideIcon }

/** An icon alone is never enough: `label` becomes the accessible name and the tooltip. */
export function IconButton({ label, icon: Icon, className, type = 'button', ...rest }: Props) {
  return (
    <button type={type} aria-label={label} title={label}
      className={[styles.iconButton, className].filter(Boolean).join(' ')} {...rest}>
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}
