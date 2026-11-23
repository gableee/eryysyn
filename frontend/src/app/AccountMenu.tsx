import { LogOut, Moon, Sun } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useSession } from '../features/auth/useSession'
import { supabase } from '../shared/supabase'
import { useTheme } from '../shared/theme'
import styles from './AccountMenu.module.css'

/**
 * Your email, light/dark, and Log out. Log out is two deliberate clicks away instead of one button next
 * to the theme toggle (Fitts: keep destructive actions away from common ones).
 * Keyboard: Enter/Space opens, first item focused, Escape closes and returns focus to the button.
 */
export function AccountMenu({ placement, showEmail = false }: { placement: 'up' | 'down'; showEmail?: boolean }) {
  const { session } = useSession()
  const { mode, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const email = session?.user.email ?? ''

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    function close(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e instanceof MouseEvent && (menu.current?.contains(e.target as Node) || button.current?.contains(e.target as Node))) return
      setOpen(false)
      if (e instanceof KeyboardEvent) button.current?.focus()
    }
    document.addEventListener('keydown', close)
    document.addEventListener('mousedown', close)
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('mousedown', close) }
  }, [open])

  return (
    <div className={styles.wrap}>
      <button ref={button} type="button" className={styles.trigger} aria-label="Account"
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)}>
        <span className={styles.avatar} aria-hidden="true">{email.slice(0, 1).toUpperCase() || '?'}</span>
        {showEmail && <span className={styles.email}>{email}</span>}
      </button>
      {open && (
        <div ref={menu} id={menuId} role="menu" aria-label="Account" className={`${styles.menu} ${styles[placement]}`}>
          <p className={styles.who}>{email}</p>
          <button type="button" role="menuitem" className={styles.item} onClick={() => { toggle(); setOpen(false) }}>
            {mode === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {mode === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" role="menuitem" className={styles.item} onClick={() => { setOpen(false); void supabase.auth.signOut() }}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
