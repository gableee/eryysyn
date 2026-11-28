/** The zoom steps of the wide-screen buttons, relative to the opening scale. The last one is also the pinch maximum. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** Two fingers that started `start.distance` apart at `start.zoom`, now `distance` apart: the zoom grows with the
 *  spread (twice as far apart, twice the size), kept within `limits`. */
export function pinchZoom(start: { distance: number; zoom: number }, distance: number, limits: { min: number; max: number }): number {
  return Math.min(limits.max, Math.max(limits.min, (start.zoom * distance) / start.distance))
}

/**
 * The scroll position that keeps the point under the fingers in place after everything grew `ratio` times.
 * Per axis: the point sits at scroll + focus in the content; after the zoom it sits at (scroll + focus) * ratio,
 * and it must still be `focus` from the visible box's edge. `focus` is relative to the scroll container's visible box.
 */
export function anchorScroll(scroll: { left: number; top: number }, focus: { x: number; y: number }, ratio: number): { left: number; top: number } {
  return { left: (scroll.left + focus.x) * ratio - focus.x, top: (scroll.top + focus.y) * ratio - focus.y }
}

/** The next button step strictly above (1) or below (-1) `zoom`, which can sit between steps after a pinch.
 *  At the ends it stays there. */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const near = 1e-6                                   // 1.0000001 after a pinch counts as 1
  if (direction === 1) return ZOOMS.find((z) => z > zoom + near) ?? ZOOMS[ZOOMS.length - 1]
  return [...ZOOMS].reverse().find((z) => z < zoom - near) ?? ZOOMS[0]
}
