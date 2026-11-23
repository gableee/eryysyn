import { MailCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import styles from './Auth.module.css'

export function CheckInboxPage() {
  const email = (useLocation().state as { email?: string } | null)?.email
  return (
          <section className={styles.card}>
        <MailCheck size={32} aria-hidden="true" className={styles.mailIcon} />
        <h1>Check your inbox</h1>
        <p>{email ? `We sent a link to ${email}. Open it, then log in.` : 'We sent you a link. Open it, then log in.'}</p>
        <p className={styles.switch}><Link to="/login">Back to log in</Link></p>
      </section>
  )
}
