import '../features/library/library.states'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../shared/theme'
import { IconButton } from '../shared/ui/IconButton'
import { registeredStates } from './devStates'
import styles from './DevStates.module.css'

/** Every component state side by side, with sample data. Only routed in development. */
export function DevStates() {
  const states = registeredStates()
  const { mode, toggle } = useTheme()
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1>Component states</h1>
        <IconButton label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          icon={mode === 'dark' ? Sun : Moon} onClick={toggle} />
      </header>
      <p className={styles.note}>Development only. Sample data, no network.</p>
      {states.length === 0 && <p>No states registered yet.</p>}
      {states.map((s) => (
        <section key={s.name} className={styles.state} aria-label={s.name}>
          <h2 className={styles.name}>{s.name}</h2>
          <div className={styles.frame}>{s.render()}</div>
        </section>
      ))}
    </main>
  )
}
