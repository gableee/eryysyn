/**
 * Split an answer into plain text and citation markers. Text stays TEXT: the result is rendered with
 * React text nodes and buttons only, never as HTML, so model output can't inject markup or links.
 *
 * A marker counts only when it is a number we have a source for, and it follows the start, whitespace,
 * punctuation or another marker. "items[1]" (code) stays text; "[9]" with no source 9 stays text.
 */
export type Segment = { kind: 'text'; text: string } | { kind: 'cite'; n: number }

const MARKER = /\[(\d{1,3})\]/g

export function parseCitations(text: string, known: number[]): Segment[][] {
  const ok = new Set(known)
  return text.split(/\n\s*\n/).map((paragraph) => {
    const out: Segment[] = []
    let last = 0
    for (const m of paragraph.matchAll(MARKER)) {
      const start = m.index!
      const before = start === 0 ? '' : paragraph[start - 1]
      const glued = /[\p{L}\p{N}_]/u.test(before)      // a letter, digit or _ right before: code, not a citation
      const n = Number(m[1])
      if (glued || !ok.has(n)) continue
      if (start > last) out.push({ kind: 'text', text: paragraph.slice(last, start) })
      out.push({ kind: 'cite', n })
      last = start + m[0].length
    }
    if (last < paragraph.length) out.push({ kind: 'text', text: paragraph.slice(last) })
    return mergeText(out)
  }).filter((p) => p.length > 0)
}

/** Skipped markers leave neighbouring text pieces: join them back into one. */
function mergeText(segments: Segment[]): Segment[] {
  const merged: Segment[] = []
  for (const s of segments) {
    const prev = merged[merged.length - 1]
    if (s.kind === 'text' && prev?.kind === 'text') prev.text += s.text
    else merged.push({ ...s })
  }
  return merged
}
