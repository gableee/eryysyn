import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { TextLayer, type PdfDocument } from './pdf'
import { findTextRanges, type TextRange } from './textMatch'
import styles from './Reader.module.css'

type Props = {
  doc: PdfDocument; n: number; scale: number; draw: boolean; width: number; height: number
  /** sentences to mark on this page; `onMarked` reports which were found (and the first mark, to scroll to) */
  highlights: string[]
  onMarked?(n: number, found: boolean[], first: HTMLElement | null): void
}

/**
 * One page's place in the column. Always there (so scrolling and page positions stay right); drawn only when
 * `draw` is true: a canvas (the picture), the PDF.js text layer (invisible, selectable, read by screen readers),
 * and an empty marks layer reserved for future highlights, pen and notes (positions relative to the page).
 */
export const PageSlot = memo(function PageSlot({ doc, n, scale, draw, width, height, highlights, onMarked }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const page = useRef<{ cleanup(): unknown } | null>(null)

  // leaving the drawn window (not a zoom, which redraws the same page): free what PDF.js keeps for the page and
  // empty the canvas. iOS Safari counts a removed canvas against its fixed canvas memory until it is emptied.
  useEffect(() => {
    if (!draw) return
    const c = canvas.current
    return () => {
      page.current?.cleanup()
      page.current = null
      if (c) { c.width = 0; c.height = 0 }
    }
  }, [draw, doc, n])

  useEffect(() => {
    if (!draw) return
    let cancelled = false
    let renderTask: { cancel(): void } | undefined
    let textLayer: { cancel(): void } | undefined
    const textDiv = text.current
    void (async () => {
      // cancelling (the page scrolled away) and closing the document make these steps reject: nothing to draw then
      try {
        const p = await doc.getPage(n)
        page.current = p
        const c = canvas.current
        const context = c?.getContext('2d')
        if (cancelled || !c || !context) return
        const viewport = p.getViewport({ scale })
        const ratio = window.devicePixelRatio || 1             // sharp on high-density screens
        c.width = Math.floor(viewport.width * ratio)
        c.height = Math.floor(viewport.height * ratio)
        const task = p.render({ canvasContext: context, canvas: c, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
        renderTask = task
        await task.promise.catch(() => {})                     // a cancelled picture still gets its text layer below
        if (cancelled || !textDiv) return
        textDiv.replaceChildren()
        const layer = new TextLayer({ textContentSource: await p.getTextContent(), container: textDiv, viewport })
        textLayer = layer
        await layer.render()
        if (cancelled || highlights.length === 0) return
        const found = highlights.map((h) => findTextRanges(layer.textContentItemsStr, h))
        const first = markRanges(layer.textDivs, found.flat())
        onMarked?.(n, found.map((r) => r.length > 0), first)
      } catch {
        // cancelled or closed: the next draw starts afresh
      }
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
      textDiv?.replaceChildren()
    }
  }, [doc, n, scale, draw, highlights, onMarked])

  const style = { width, height, '--total-scale-factor': scale, '--scale-round-x': '1px', '--scale-round-y': '1px' } as CSSProperties
  return (
    <div data-page={n} className={styles.slot} style={style} role="group" aria-label={`Page ${n}`}>
      {draw && <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />}
      <div ref={text} className="textLayer" />
      <div className={styles.marksLayer} />
    </div>
  )
})

/**
 * Wraps the matched text of each text-layer piece in <mark> elements, built with DOM text nodes (never HTML),
 * and returns the first mark. Several ranges in one piece are applied left to right.
 */
function markRanges(divs: HTMLElement[], ranges: TextRange[]): HTMLElement | null {
  let first: HTMLElement | null = null
  const byItem = new Map<number, TextRange[]>()
  for (const r of ranges) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r])
  for (const [item, list] of [...byItem].sort((a, b) => a[0] - b[0])) {
    const div = divs[item]
    if (!div) continue
    const text = div.textContent ?? ''
    const parts: Node[] = []
    let at = 0
    for (const r of list.sort((a, b) => a.start - b.start)) {
      if (r.start < at) continue                                  // overlapping matches: keep the first
      if (r.start > at) parts.push(document.createTextNode(text.slice(at, r.start)))
      const mark = document.createElement('mark')
      mark.className = styles.pageMark
      mark.textContent = text.slice(r.start, r.end)
      parts.push(mark)
      first ??= mark
      at = r.end
    }
    if (at < text.length) parts.push(document.createTextNode(text.slice(at)))
    div.replaceChildren(...parts)
  }
  return first
}

