/**
 * Where does a sentence sit in a page's text layer? PDF.js gives the page text as pieces ("items"): a line,
 * part of a line, sometimes half a word ("pres" | "sure"), with line-break hyphens ("sys-" | "tolic").
 *
 * Approach: compare letters and digits only. Both the page text and the sentence are reduced to lower-case
 * letters/digits (spaces, punctuation, hyphens and line breaks dropped), so all those splits disappear. Each
 * kept character remembers which item and offset it came from, so a match maps back to exact ranges.
 */
export type TextRange = { item: number; start: number; end: number }   // end is exclusive

const KEEP = /[\p{L}\p{N}]/u
const TRAILING = /[.!?)\]"”’-]/         // closing punctuation or a line-break hyphen right after the last letter

export function findTextRanges(items: string[], sentence: string): TextRange[] {
  const needle = [...sentence.toLowerCase()].filter((c) => KEEP.test(c)).join('')
  if (!needle) return []

  let hay = ''
  const from: { item: number; offset: number }[] = []
  items.forEach((text, item) => {
    ;[...text].forEach((c, offset) => {
      if (!KEEP.test(c)) return
      hay += c.toLowerCase()
      from.push({ item, offset })
    })
  })

  const at = hay.indexOf(needle)
  if (at < 0) return []

  const ranges: TextRange[] = []
  for (let i = at; i < at + needle.length; i++) {
    const { item, offset } = from[i]
    const last = ranges[ranges.length - 1]
    if (last && last.item === item) last.end = offset + 1
    else ranges.push({ item, start: offset, end: offset + 1 })
  }
  for (const r of ranges) if (TRAILING.test(items[r.item][r.end] ?? '')) r.end += 1
  return ranges
}
