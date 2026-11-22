import type { ReactNode } from 'react'

/** Text for screen readers only (e.g. "opens in this page"), invisible on screen. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span style={{
      position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
    }}>{children}</span>
  )
}
