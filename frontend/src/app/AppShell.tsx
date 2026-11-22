import { LibraryBig, LogOut, Menu, MessageSquare, Moon, Plus, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { supabase } from '../shared/supabase'
import { useTheme } from '../shared/theme'
import { Button } from '../shared/ui/Button'
import { IconButton } from '../shared/ui/IconButton'
import styles from './AppShell.module.css'
import { MobileDrawer } from './MobileDrawer'
import { useSidebarExtra } from './ShellContext'

const NAV = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/library', label: 'Library', icon: LibraryBig },
]

function MainNav({ onNavigate }: { onNavigate?(): void }) {
  return (
    <nav aria-label="Main" className={styles.nav}>
      <NavLink to="/chat" end viewTransition className={styles.newChat} onClick={onNavigate}>
        <Plus size={18} aria-hidden="true" /> <span className={styles.label}>New chat</span>
      </NavLink>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} viewTransition onClick={onNavigate}
          className={({ isActive }) => [styles.link, isActive && styles.active].filter(Boolean).join(' ')}>
          <Icon size={18} aria-hidden="true" /> <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell({ sidebarExtra }: { sidebarExtra?: ReactNode }) {
  const { mode, toggle } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const extra = useSidebarExtra() ?? sidebarExtra

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <IconButton className={styles.menu} label="Open menu" icon={Menu} onClick={() => setDrawerOpen(true)} />
        <span className={styles.logo}>Eryysyn</span>
        <span className={styles.spacer} />
        <IconButton label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          icon={mode === 'dark' ? Sun : Moon} onClick={toggle} />
        <Button variant="quiet" onClick={() => supabase.auth.signOut()}>
          <LogOut size={18} aria-hidden="true" /> <span className={styles.label}>Log out</span>
        </Button>
      </header>

      <aside className={styles.sidebar}>
        <MainNav />
        {extra}
      </aside>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <MainNav onNavigate={() => setDrawerOpen(false)} />
        {extra}
      </MobileDrawer>

      <main className={styles.main} id="main">
        <Outlet />
      </main>

      <nav aria-label="Tabs" className={styles.tabs}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} viewTransition
            className={({ isActive }) => [styles.tab, isActive && styles.active].filter(Boolean).join(' ')}>
            <Icon size={22} aria-hidden="true" /> <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
