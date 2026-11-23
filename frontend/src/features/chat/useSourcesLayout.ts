import { useEffect, useState, type RefObject } from 'react'

/** "panel" beside the chat when its container is at least 820px wide, else "inline" under each answer.
 *  Measured on the container (not the screen), so a hidden sidebar or a split screen gets what fits. */
export function useSourcesLayout(ref: RefObject<HTMLElement | null>): 'panel' | 'inline' {
  const [layout, setLayout] = useState<'panel' | 'inline'>('panel')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setLayout(entry.contentRect.width >= 820 ? 'panel' : 'inline'))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return layout
}
