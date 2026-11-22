import { registeredStates } from './devStates'
import styles from './DevStates.module.css'

/** Every component state side by side, with sample data. Only routed in development. */
export function DevStates() {
  const states = registeredStates()
  return (
    <main className={styles.page}>
      <h1>Component states</h1>
      <p className={styles.note}>Development only. Sample data, no network. Toggle light and dark in the top bar.</p>
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
