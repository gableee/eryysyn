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

/** the scale at which the column fills the view, leaving `padding` CSS px on each side */
export function columnScale(viewWidth: number, column: Column, padding = 12): number {
  return (viewWidth - 2 * padding) / (column.right - column.left)
}
