import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { TextLayer, type PdfDocument } from './pdf'
import { canvasDensity } from './canvasDensity'
import { barFor } from './marginBars'
import { findTextRanges, type TextRange } from './textMatch'
import styles from './Reader.module.css'

type Props = {
  doc: PdfDocument; n: number; scale: number; draw: boolean; width: number; height: number
  /** sentences to mark on this page (`index` = position in the citation's list); `onMarked` reports which were
   *  found (and the first mark, to scroll to) */
  highlights: { index: number; text: string }[]
  /** the citation number shown in each margin bar's circle */
  label?: number
  onMarked?(n: number, found: { index: number; found: boolean }[], first: HTMLElement | null): void
}

/**
 * One page's place in the column. Always there (so scrolling and page positions stay right); drawn only when
 * `draw` is true: a canvas (the picture), the PDF.js text layer (invisible, selectable, read by screen readers),
 * and the marks layer: the margin bars of the marked sentences (later also pen and notes), positioned relative to the page.
 */
export const PageSlot = memo(function PageSlot({ doc, n, scale, draw, width, height, highlights, label, onMarked }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const marks = useRef<HTMLDivElement>(null)
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
    const marksDiv = marks.current
    const slot = textDiv?.parentElement
    void (async () => {
      // cancelling (the page scrolled away) and closing the document make these steps reject: nothing to draw then
      try {
        const p = await doc.getPage(n)
        page.current = p
        const c = canvas.current
        const context = c?.getContext('2d')
        if (cancelled || !c || !context) return
        const viewport = p.getViewport({ scale })
        // sharp on high-density screens, but never a canvas too big for the phone (zoomed far in): see canvasDensity
        const ratio = canvasDensity(window.devicePixelRatio || 1, viewport.width, viewport.height)
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
        const found = highlights.map((h) => ({ index: h.index, ranges: findTextRanges(layer.textContentItemsStr, h.text) }))
        const marked = markRanges(layer.textDivs, found)
        if (marksDiv && slot) drawBars(marksDiv, slot, marked, label)
        const first = [...marked.values()].flat().sort(documentOrder)[0] ?? null
        onMarked?.(n, found.map((f) => ({ index: f.index, found: f.ranges.length > 0 })), first)
      } catch {
        // cancelled or closed: the next draw starts afresh
      }
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
      textDiv?.replaceChildren()
      marksDiv?.replaceChildren()
    }
  }, [doc, n, scale, draw, highlights, label, onMarked])

  const style = { width, height, '--total-scale-factor': scale, '--scale-round-x': '1px', '--scale-round-y': '1px' } as CSSProperties
  return (
    <div data-page={n} className={styles.slot} style={style} role="group" aria-label={`Page ${n}`}>
      {draw && <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />}
      <div ref={text} className="textLayer" />
      <div ref={marks} className={styles.marksLayer} />
    </div>
  )
})

/**
 * Wraps the matched text of each text-layer piece in <mark data-sentence> elements, built with DOM text nodes
 * (never HTML), and returns the marks of each sentence. Several ranges in one piece are applied left to right.
 */
function markRanges(divs: HTMLElement[], perSentence: { index: number; ranges: TextRange[] }[]): Map<number, HTMLElement[]> {
  const marks = new Map<number, HTMLElement[]>()
  const byItem = new Map<number, { index: number; range: TextRange }[]>()
  for (const s of perSentence) for (const range of s.ranges) byItem.set(range.item, [...(byItem.get(range.item) ?? []), { index: s.index, range }])
  for (const [item, list] of [...byItem].sort((a, b) => a[0] - b[0])) {
    const div = divs[item]
    if (!div) continue
    const text = div.textContent ?? ''
    const parts: Node[] = []
    let at = 0
    for (const { index, range: r } of list.sort((a, b) => a.range.start - b.range.start)) {
      if (r.start < at) continue                                  // overlapping matches: keep the first
      if (r.start > at) parts.push(document.createTextNode(text.slice(at, r.start)))
      const mark = document.createElement('mark')
      mark.className = styles.pageMark
      mark.dataset.sentence = String(index)
      mark.textContent = text.slice(r.start, r.end)
      parts.push(mark)
      marks.set(index, [...(marks.get(index) ?? []), mark])
      at = r.end
    }
    if (at < text.length) parts.push(document.createTextNode(text.slice(at)))
    div.replaceChildren(...parts)
  }
  return marks
}

const documentOrder = (a: HTMLElement, b: HTMLElement) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)

/** One margin bar per marked sentence, with the citation number on top. Rebuilt on every draw, so zoom keeps them aligned. */
function drawBars(layer: HTMLElement, slot: HTMLElement, marks: Map<number, HTMLElement[]>, label: number | undefined) {
  const origin = slot.getBoundingClientRect()
  for (const [index, list] of marks) {
    const bar = barFor(list.map((m) => {
      const r = m.getBoundingClientRect()
      return { top: r.top - origin.top, bottom: r.bottom - origin.top, left: r.left - origin.left }
    }))
    if (!bar) continue
    const div = document.createElement('div')
    div.className = styles.marginBar
    div.dataset.bar = String(index)
    div.setAttribute('aria-hidden', 'true')
    div.style.cssText = `top:${bar.top}px;height:${bar.height}px;left:${bar.left}px`
    if (label !== undefined) {
      const num = document.createElement('span')
      num.className = styles.marginNum
      num.textContent = String(label)
      div.append(num)
    }
    layer.append(div)
  }
}
