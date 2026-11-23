import { LibraryBig, Menu, MessageSquare, Plus } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useMatches } from 'react-router'
import { ShellSidebarContext } from '../shared/shellSidebar'
import { IconButton } from '../shared/ui/IconButton'
import { AccountMenu } from './AccountMenu'
import styles from './AppShell.module.css'
import { MobileDrawer } from './MobileDrawer'
import { useSidebarExtra } from './ShellContext'

/** Sidebar: New chat (the way into Chat), Library, then Recent chats. "Chat" itself is not a second link. */
function MainNav({ onNavigate }: { onNavigate?(): void }) {
  const cls = ({ isActive }: { isActive: boolean }) => [styles.link, isActive && styles.active].filter(Boolean).join(' ')
  return (
    <nav aria-label="Main" className={styles.nav}>
      <NavLink to="/chat" end viewTransition className={styles.newChat} onClick={onNavigate}>
        <Plus size={18} aria-hidden="true" /> <span className={styles.label}>New chat</span>
      </NavLink>
      <NavLink to="/library" viewTransition onClick={onNavigate} className={cls}>
        <LibraryBig size={18} aria-hidden="true" /> <span className={styles.label}>Library</span>
      </NavLink>
    </nav>
  )
}

const TABS = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/library', label: 'Library', icon: LibraryBig },
]

/**
 * Desktop (>= 960px): no top bar; logo at the top of the sidebar, account at its bottom (like Claude/ChatGPT),
 * so the chat gets the full height. Narrower: a slim top bar with the menu button, logo and account.
 */
const READER_SIDEBAR = 'eryysyn.readerSidebar'
function readReaderSidebar(): boolean {
  try { return localStorage.getItem(READER_SIDEBAR) === 'open' } catch { return false }   // storage can be blocked
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const extra = useSidebarExtra()
  // Reader routes (route handle { reader: true }) run full window: no top bar, no tabs, sidebar only on request
  const inReader = useMatches().some((m) => (m.handle as { reader?: boolean } | undefined)?.reader === true)
  const [readerSidebar, setReaderSidebarState] = useState(readReaderSidebar)
  function setReaderSidebar(open: boolean) {
    setReaderSidebarState(open)
    try { localStorage.setItem(READER_SIDEBAR, open ? 'open' : 'closed') } catch { /* remembered for this visit only */ }
  }
  const chrome = !inReader

  return (
    <ShellSidebarContext.Provider value={{ inReader, open: readerSidebar, setOpen: setReaderSidebar }}>
    <div className={styles.shell} data-reader={inReader ? (readerSidebar ? 'sidebar' : 'full') : undefined}>
      {chrome && <header className={styles.bar}>
        <IconButton className={styles.menu} label="Open menu" icon={Menu} onClick={() => setDrawerOpen(true)} />
        <span className={styles.logo}>Eryysyn</span>
        <span className={styles.spacer} />
        <AccountMenu placement="down" />
      </header>}

      {(chrome || readerSidebar) && <aside className={styles.sidebar}>
        <span className={`${styles.logo} ${styles.sideLogo}`}>Eryysyn</span>
        <MainNav />
        <div className={styles.extra}>{extra}</div>
        <div className={styles.account}><AccountMenu placement="up" showEmail /></div>
      </aside>}

      {chrome && <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <MainNav onNavigate={() => setDrawerOpen(false)} />
        {extra}
      </MobileDrawer>}

      <main className={styles.main} id="main">
        <Outlet />
      </main>

      {chrome && <nav aria-label="Tabs" className={styles.tabs}>
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} viewTransition
            className={({ isActive }) => [styles.tab, isActive && styles.active].filter(Boolean).join(' ')}>
            <Icon size={22} aria-hidden="true" /> <span>{label}</span>
          </NavLink>
        ))}
      </nav>}
    </div>
    </ShellSidebarContext.Provider>
  )
}
