/** Where the text sits on a page, in PDF units: the leftmost start to the rightmost end of any non-blank item. */
export type Column = { left: number; right: number }
type Item = { transform: number[]; width: number; str: string }

const MIN_SHARE = 0.2   // narrower than this is a sliver (a page number, a stray label), not a text column

/** null when the page has no text, or only a sliver, so the caller falls back to fitting the whole page width */
export function textColumn(items: Item[], pageWidth: number): Column | null {
  let left = Infinity
  let right = -Infinity
  for (const item of items) {
    if (!item.str.trim()) continue
    left = Math.min(left, item.transform[4])
    right = Math.max(right, item.transform[4] + item.width)
  }
  if (!(right > left) || right - left < pageWidth * MIN_SHARE) return null
  return { left, right }
}

/** CSS px between the view's edges and the column. The left one is wider: the margin bar sits 10px left of the text
 *  and its 16px number circle reaches 6px further, so with 12px the circle was cut off at the edge (final review F3). */
export const COLUMN_GAP = { left: 22, right: 12 }

/** the scale at which the column fills the view, leaving `gap` CSS px on each side */
export function columnScale(viewWidth: number, column: Column, gap = COLUMN_GAP): number {
  return (viewWidth - gap.left - gap.right) / (column.right - column.left)
}
