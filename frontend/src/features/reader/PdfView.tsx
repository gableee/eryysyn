import { Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import { clampPage, pagesToDraw } from './pageWindow'
import { PageSlot } from './PageSlot'
import { loadErrorKind, openPdf, type PdfDocument } from './pdf'
import styles from './Reader.module.css'

export type PdfViewProps = {
  url: string
  page: number
  highlights: string[]
  /** jumped: opened, a key, or a new ?page= (worth announcing); false while scrolling (not announced) */
  onPageChange(page: number, total: number, jumped: boolean): void
  onExpired(): void
  onBroken(): void
  /** none of the cited page or the next one contains a highlight: the Source tab says "Marked in the excerpt only" */
  onHighlightMissing?(): void
  /** the first marks came into view: how many sentences were found */
  onMarksShown?(count: number): void
}

const MAX_FIT_WIDTH = 900                 // "fit to width" stops here on very wide screens
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const WIDE = 1000                         // zoom buttons only where there is room (touch screens pinch instead)
const NONE: string[] = []                 // one stable empty list, so idle pages never redraw

/**
 * The whole PDF in one scroll column, opened at `page`. Every page has a slot of the right size, but only the
 * visible page and its neighbours are drawn, so a 340-page file stays light. Keys: PageUp/PageDown, ←/→, Home/End.
 */
export function PdfView({ url, page, highlights, onPageChange, onExpired, onBroken, onHighlightMissing, onMarksShown }: PdfViewProps) {
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [base, setBase] = useState({ width: 612, height: 792 })   // page 1 at scale 1 (US Letter until known)
  const [visible, setVisible] = useState(1)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const region = useRef<HTMLDivElement>(null)
  const slot = (n: number) => region.current?.querySelector<HTMLElement>(`[data-page="${n}"]`)
  const current = useRef(page)              // reopening after a renewed link keeps the student's place
  const jump = useRef<number | null>(null)
  const focused = useRef(false)
  const callbacks = useRef({ onPageChange, onExpired, onBroken, onHighlightMissing, onMarksShown })
  useEffect(() => { callbacks.current = { onPageChange, onExpired, onBroken, onHighlightMissing, onMarksShown } })
  // highlights not found on the cited page are looked for on the next one (a passage can cross a page end)
  // both belong to one set of highlights: opening another citation in the same PDF starts afresh
  const [spillState, setSpill] = useState<{ for: string[]; page: number; sentences: string[] } | null>(null)
  const spill = spillState?.for === highlights ? spillState : null
  const marked = useRef({ for: highlights, scrolled: false, missingReported: false })

  // open (and reopen when the link is renewed)
  useEffect(() => {
    let alive = true
    const task = openPdf(url)
    task.promise.then(async (d) => {
      const first = await d.getPage(1)
      if (!alive) return
      const vp = first.getViewport({ scale: 1 })
      setBase({ width: vp.width, height: vp.height })
      setDoc(d)
      const start = clampPage(String(current.current), d.numPages)
      jump.current = start
      setVisible(start)
    }).catch((error: unknown) => {
      if (!alive) return
      if (loadErrorKind(error) === 'expired') callbacks.current.onExpired()
      else callbacks.current.onBroken()
    })
    return () => { alive = false; void task.destroy() }
  }, [url])

  // a new ?page= (another citation in the same document): scroll there; the visibility observer below then
  // updates the current page, exactly as when the student scrolls by hand
  useEffect(() => {
    if (!doc) return
    region.current?.querySelector<HTMLElement>(`[data-page="${clampPage(String(page), doc.numPages)}"]`)?.scrollIntoView?.({ block: 'start' })
  }, [page, doc])

  // tell the toolbar, remember the place, and scroll after a jump
  useEffect(() => {
    if (!doc) return
    current.current = visible
    callbacks.current.onPageChange(visible, doc.numPages, jump.current !== null)
    if (jump.current !== null) {
      slot(jump.current)?.scrollIntoView?.({ block: 'start' })
      jump.current = null
    }
    // the first time the document is shown, keyboard focus goes to the pages (without scrolling), so PageDown works
    // at once and Shift+Tab reaches the toolbar; never again, so a renewed link can't steal focus from the Chat tab
    if (!focused.current) {
      focused.current = true
      region.current?.focus({ preventScroll: true })
    }
  }, [visible, doc])

  // the column's width decides the "fit to width" scale
  useEffect(() => {
    const el = region.current
    if (!el) return
    setWidth(el.clientWidth || 800)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  // the page in view while scrolling: the slot that shows the most
  useEffect(() => {
    if (!doc || typeof IntersectionObserver === 'undefined') return
    const ratios = new Map<number, number>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio)
      let best = 0
      let bestRatio = 0
      for (const [p, r] of ratios) if (r > bestRatio) { best = p; bestRatio = r }
      if (best && jump.current === null) setVisible(best)
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] })
    region.current?.querySelectorAll('[data-page]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [doc, zoom, width])

  // when the page size changes (the real width arrives, a phone rotates, zoom), stay on the same page
  const fit = Math.min(Math.max(width - 32, 200), MAX_FIT_WIDTH) / base.width
  const scale = fit * zoom
  useEffect(() => {
    if (!doc) return
    region.current?.querySelector<HTMLElement>(`[data-page="${current.current}"]`)?.scrollIntoView?.({ block: 'start' })
  }, [scale, doc])

  const cited = doc && highlights.length > 0 ? clampPage(String(page), doc.numPages) : 0
  const onMarked = useCallback((n: number, found: boolean[], first: HTMLElement | null) => {
    if (marked.current.for !== highlights) marked.current = { for: highlights, scrolled: false, missingReported: false }
    if (first && !marked.current.scrolled) {                     // bring the first mark into view, once
      marked.current.scrolled = true
      first.scrollIntoView?.({ block: 'center' })
      callbacks.current.onMarksShown?.(found.filter(Boolean).length)
    }
    const missing = () => {
      if (marked.current.missingReported) return
      marked.current.missingReported = true
      callbacks.current.onHighlightMissing?.()
    }
    if (n === cited) {
      const rest = highlights.filter((_, i) => !found[i])
      if (rest.length === 0) return
      if (!doc || cited + 1 > doc.numPages) missing()
      else setSpill((s) => (s && s.for === highlights && s.page === cited + 1 ? s : { for: highlights, page: cited + 1, sentences: rest }))
    } else if (found.some((f) => !f)) {
      missing()
    }
  }, [cited, highlights, doc])

  function goTo(p: number) {
    if (!doc) return
    const target = clampPage(String(p), doc.numPages)
    jump.current = target
    setVisible(target)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, number | undefined> = {
      PageDown: visible + 1, ArrowRight: visible + 1, PageUp: visible - 1, ArrowLeft: visible - 1,
      Home: 1, End: doc?.numPages,
    }
    const to = moves[e.key]
    if (to === undefined) return
    e.preventDefault()
    goTo(to)
  }

  const draw = new Set(doc ? pagesToDraw(visible, doc.numPages) : [])
  const zoomIndex = ZOOMS.indexOf(zoom)

  return (
    <div className={styles.view}>
      {/* tabIndex: the keyboard can focus the pages and move through them */}
      <div ref={region} className={styles.pages} role="region" aria-label="PDF pages" tabIndex={0} onKeyDown={onKeyDown}>
        {doc && Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
          <PageSlot key={n} doc={doc} n={n} scale={scale} draw={draw.has(n)} onMarked={onMarked}
            highlights={n === cited ? highlights : spill && n === spill.page ? spill.sentences : NONE}
            width={Math.floor(base.width * scale)} height={Math.floor(base.height * scale)} />
        ))}
      </div>
      {doc && width >= WIDE && (
        <div className={styles.zoom} role="group" aria-label="Zoom">
          <IconButton icon={Minus} label="Zoom out" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[zoomIndex - 1])} />
          <IconButton icon={Maximize} label="Fit to width" disabled={zoom === 1} onClick={() => setZoom(1)} />
          <IconButton icon={Plus} label="Zoom in" disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zoomIndex + 1])} />
        </div>
      )}
    </div>
  )
}
