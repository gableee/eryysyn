import { NavLink } from 'react-router'
import styles from './Chat.module.css'
import { useConversations } from './hooks'

/** Recent chats in the sidebar, newest first (the backend orders them). */
export function ChatList() {
  const conversations = useConversations()
  const items = conversations.data ?? []
  if (items.length === 0) return null
  return (
    <nav aria-label="Recent chats" className={styles.recent}>
      <h2 className={styles.recentTitle}>Recent</h2>
      {items.map((c) => (
        <NavLink key={c.id} to={`/chat/${c.id}`} viewTransition
          className={({ isActive }) => [styles.recentLink, isActive && styles.recentActive].filter(Boolean).join(' ')}>
          {c.title ?? 'Untitled chat'}
        </NavLink>
      ))}
    </nav>
  )
}
