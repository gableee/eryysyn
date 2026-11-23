import { useEffect, useState, type RefObject } from 'react'

export type ReaderLayout = 'wide' | 'medium' | 'phone'

const decide = (width: number, height: number): ReaderLayout =>
  height < 500 || width < 600 ? 'phone' : width >= 1000 ? 'wide' : 'medium'

/**
 * Where the Source/Chat panel goes, by the space the Reader really has (not the device name):
 * wide >= 1000px docked beside the page · medium 600-999px slides over it · phone (< 600px, or < 500px tall) none.
 */
export function useReaderLayout(ref: RefObject<HTMLElement | null>): ReaderLayout {
  const [layout, setLayout] = useState<ReaderLayout>(() => decide(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setLayout(decide(entry.contentRect.width, window.innerHeight)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return layout
}
