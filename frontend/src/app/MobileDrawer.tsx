import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from '../shared/ui/IconButton'
import styles from './AppShell.module.css'

/**
 * The sidebar on narrow or short screens. Slides in with a spring that settles without bouncing
 * (iOS feel); Escape, the backdrop or a link closes it. Reduced motion: no slide, appears at once.
 */
export function MobileDrawer({ open, onClose, children }: { open: boolean; onClose(): void; children: ReactNode }) {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: 0.3 }
  return (
    <AnimatePresence>
      {open && (
        <div className={styles.drawerLayer}>
          <motion.div className={styles.backdrop} onClick={onClose} aria-hidden="true"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2 }} />
          <motion.div ref={panel} className={styles.drawer} role="dialog" aria-modal="true" aria-label="Menu"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={spring}>
            <IconButton label="Close menu" icon={X} onClick={onClose} className={styles.close} />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
