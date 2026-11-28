/** A marked piece of text, in pixels relative to its page. */
export type MarkRect = { top: number; bottom: number; left: number }
/** The margin bar drawn beside a marked sentence, in pixels relative to its page. */
export type Bar = { top: number; height: number; left: number }

/**
 * One bar covering all lines of a sentence, `gap` pixels left of its leftmost text, never closer than 2px to
 * the page edge. No rectangles (nothing was marked) means no bar.
 */
export function barFor(rects: MarkRect[], gap = 10): Bar | null {
  if (rects.length === 0) return null
  const top = Math.min(...rects.map((r) => r.top))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  const left = Math.min(...rects.map((r) => r.left))
  return { top, height: bottom - top, left: Math.max(2, left - gap) }
}
