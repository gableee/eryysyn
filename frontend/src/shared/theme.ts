import { useCallback, useState } from 'react'

export type Mode = 'light' | 'dark'
const KEY = 'eryysyn.mode'

/** Storage can throw (private windows, blocked site data): the theme must still work, just unsaved. */
function saved(): Mode | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** The saved choice, else the device setting. */
export function initialMode(): Mode {
  return saved() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode
}

export function useTheme(): { mode: Mode; toggle(): void } {
  const [mode, setMode] = useState<Mode>(() => (document.documentElement.dataset.mode as Mode) || initialMode())
  const toggle = useCallback(() => {
    setMode((m) => {
      const next: Mode = m === 'dark' ? 'light' : 'dark'
      applyMode(next)
      try { localStorage.setItem(KEY, next) } catch { /* not saved, still applied */ }
      return next
    })
  }, [])
  return { mode, toggle }
}
