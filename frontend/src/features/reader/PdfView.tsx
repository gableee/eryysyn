import { Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import { clampPage, pagesToDraw } from './pageWindow'
import { anchorScroll, nextZoomStep, pinchZoom, ZOOMS } from './pinch'
import { PageSlot } from './PageSlot'
import { columnScale, textColumn, type Column } from './textColumn'
import { loadErrorKind, openPdf, type PdfDocument } from './pdf'
import styles from './Reader.module.css'

export type PdfViewProps = {
  url: string
  page: number
  highlights: string[]
  /** the citation number shown in the margin bar beside each marked sentence */
  label?: number
  /** jumped: opened, a key, or a new ?page= (worth announcing); false while scrolling (not announced) */
  onPageChange(page: number, total: number, jumped: boolean): void
  onExpired(): void
  onBroken(): void
  /** the download failed for another reason (the network dropped, the server stopped): worth trying again */
  onFailed(): void
  /** once per set of highlights, when the cited page (and the next, if needed) are done: which sentences were found
   *  and on which page (sorted by page, then index), out of `total`. 0 found = the Source tab says "Not found on this page" */
  onMarks?(found: { index: number; page: number }[], total: number): void
  /** the first marks came into view: how many sentences were found */
  onMarksShown?(count: number): void
  /** how the page opens: 'width' fits the paper to the view; 'column' (phones) fits the page's text column, so the
   *  text starts bigger and the white margins are a swipe away */
  fit?: 'width' | 'column'
  /** a quick one-finger tap on the pages (moved under 10px, lifted within 300ms); a drag or a pinch is never a tap */
  onTap?(): void
  /** gives the parent the handle below (React 19: a ref is an ordinary prop) */
  ref?: Ref<PdfViewHandle>
}

export type PdfViewHandle = {
  /** scroll to the mark of one sentence (its index in `highlights`), going to its page first if that is not drawn */
  showSentence(index: number): void
}

const MAX_FIT_WIDTH = 900                 // "fit to width" stops here on very wide screens
const PAD = 16                            // .pages padding on each side; the size observer reports the width inside it
const WIDE = 1000                         // zoom buttons only where there is room (touch screens pinch instead)
const MAX_ZOOM = ZOOMS[ZOOMS.length - 1]  // 4 times the opening scale
const TAP = { move: 10, ms: 300 }         // a tap moves less than this and lifts sooner than this
const NONE: { index: number; text: string }[] = []                 // one stable empty list, so idle pages never redraw

/** the width inside the pages' padding, the same measure the size observer reports (clientWidth minus both paddings) */
const contentWidth = (el: HTMLElement | null) => (el?.clientWidth ? el.clientWidth - 2 * PAD : 800)

/** Where a point on screen sits: `n` is the page it is on, `scroll` is where the visible box starts in that page's own
 *  coordinates (the window scrolls up and down, the pages area sideways), `focus` is the point within the visible box.
 *  Measured from the page, not the top of the document, because the gaps between pages don't grow with the zoom. */
type Place = { n: number; scroll: { left: number; top: number }; focus: { x: number; y: number }; scale: number }

/**
 * The whole PDF in one scroll column, opened at `page`. Every page has a slot of the right size, but only the
 * visible page and its neighbours are drawn, so a 340-page file stays light. Keys: PageUp/PageDown, ←/→, Home/End.
 */
export function PdfView({ url, page, highlights, label, onPageChange, onExpired, onBroken, onFailed, onMarks, onMarksShown, fit: fitMode = 'width', onTap, ref }: PdfViewProps) {
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [base, setBase] = useState({ width: 612, height: 792 })   // page 1 at scale 1 (US Letter until known)
  const [visible, setVisible] = useState(1)
  const [width, setWidth] = useState(0)
  const [column, setColumn] = useState<Column | null>(null)   // the opening page's text column (fit="column"), or null
  const [zoom, setZoom] = useState(1)
  const region = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)   // the pages inside the region: scaled with a CSS transform while pinching
  const slot = (n: number) => region.current?.querySelector<HTMLElement>(`[data-page="${n}"]`)
  const current = useRef(page)              // reopening after a renewed link keeps the student's place
  const jump = useRef<number | null>(null)
  const focused = useRef(false)
  const callbacks = useRef({ onPageChange, onExpired, onBroken, onFailed, onMarks, onMarksShown, onTap })
  useEffect(() => { callbacks.current = { onPageChange, onExpired, onBroken, onFailed, onMarks, onMarksShown, onTap } })
  // touch: the fingers on the pages, the pinch in progress, and a possible tap
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance: number; zoom: number; now: number; place: Place } | null>(null)
  const tap = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  const anchor = useRef<Place | null>(null)      // a zoom by the student, waiting for the redraw to put its point back
  // highlights not found on the cited page are looked for on the next one (a passage can cross a page end)
  // both belong to one set of highlights: opening another citation in the same PDF starts afresh
  const [spillState, setSpill] = useState<{ for: string[]; page: number; sentences: { index: number; text: string }[] } | null>(null)
  const spill = spillState?.for === highlights ? spillState : null
  // per set of highlights: what was found on the cited page, whether the report went out, and the sentence
  // showSentence is waiting for (its page was not drawn yet)
  const fresh = (h: string[]): { for: string[]; scrolled: boolean; reported: boolean; cited: { index: number; page: number }[]; all: { index: number; page: number }[]; waiting: number | null } =>
    ({ for: h, scrolled: false, reported: false, cited: [], all: [], waiting: null })
  const marked = useRef(fresh(highlights))

  // open (and reopen when the link is renewed)
  useEffect(() => {
    let alive = true
    const task = openPdf(url)
    task.promise.then(async (d) => {
      const first = await d.getPage(1)
      if (!alive) return
      const vp = first.getViewport({ scale: 1 })
      const start = clampPage(String(current.current), d.numPages)
      // phones: measure the page being opened BEFORE showing anything, so the first draw is already at the right
      // size and nothing jumps. No text (a scan) or a failed read: fit the page width as usual.
      let found: Column | null = null
      if (fitMode === 'column') {
        try {
          const content = await (await d.getPage(start)).getTextContent()
          found = textColumn(content.items as { transform: number[]; width: number; str: string }[], vp.width)
        } catch { found = null }
        if (!alive) return
        setWidth(contentWidth(region.current))
      }
      setColumn(found)
      setBase({ width: vp.width, height: vp.height })
      setDoc(d)
      jump.current = start
      setVisible(start)
    }).catch((error: unknown) => {
      if (!alive) return
      const kind = loadErrorKind(error)
      if (kind === 'expired') callbacks.current.onExpired()
      else if (kind === 'broken') callbacks.current.onBroken()
      else callbacks.current.onFailed()
    })
    return () => { alive = false; void task.destroy() }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fit is chosen once per opened document
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
    // at once and Shift+Tab reaches the toolbar; never again, so a renewed link can't steal focus from the Chat tab,
    // and never from something the student is already using (typing a question while the PDF loads)
    if (!focused.current) {
      focused.current = true
      const active = document.activeElement
      if (!active || active === document.body) region.current?.focus({ preventScroll: true })
    }
  }, [visible, doc])

  // the column's width decides the "fit to width" scale
  useEffect(() => {
    const el = region.current
    if (!el) return
    setWidth(fitMode === 'column' ? contentWidth(el) : el.clientWidth || 800)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fit is chosen once per opened document
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

  // the opening fit is one number; zoom is a multiplier on it
  const widthFit = Math.min(Math.max(width - 32, 200), MAX_FIT_WIDTH) / base.width
  const fit = column ? columnScale(width + 2 * PAD, column) : widthFit
  const scale = fit * zoom
  const minZoom = Math.min(1, widthFit / fit)    // pinching out stops where the whole page width fits (phones: below 1)

  // a zoom by the student (fingers or buttons): the new sizes are laid out but not painted yet, so drop the pinch
  // transform and scroll the point they zoomed around back under the same spot on screen, all in one frame
  useLayoutEffect(() => {
    const a = anchor.current
    const el = region.current
    if (!a || !el) return
    if (sheet.current) sheet.current.style.transform = ''
    const to = anchorScroll(a.scroll, a.focus, scale / a.scale)
    const page = slot(a.n)?.getBoundingClientRect()
    if (!page) { anchor.current = null; return }                 // no page to keep in place: never leave the anchor behind
    el.scrollLeft += page.left - el.getBoundingClientRect().left + to.left           // the pages area scrolls sideways
    const scroller = document.scrollingElement ?? document.documentElement            // the window scrolls up and down
    scroller.scrollTop += page.top + to.top
  }, [scale])

  // two fingers belong to our pinch: stop the browser panning (or, on iOS, zooming) under them, which would cancel the
  // pointers mid-pinch. One finger is left alone, so scrolling stays native. (React's touch handlers are passive.)
  useEffect(() => {
    const el = region.current
    if (!el) return
    const hold = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    el.addEventListener('touchmove', hold, { passive: false })
    return () => el.removeEventListener('touchmove', hold)
  }, [])

  // a size change that is not the student's zoom (opening, the real width arriving, a phone rotating): back to the
  // top of the same page; with a column fit the pages are wider than the view, so start the sideways scroll at the text
  useEffect(() => {
    if (anchor.current) { anchor.current = null; return }      // the student's zoom: already placed above
    if (!doc) return
    region.current?.querySelector<HTMLElement>(`[data-page="${current.current}"]`)?.scrollIntoView?.({ block: 'start' })
    if (column && region.current) region.current.scrollLeft = Math.max(0, column.left * scale + PAD - 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scale already follows column
  }, [scale, doc])

  const cited = doc && highlights.length > 0 ? clampPage(String(page), doc.numPages) : 0
  const citedSentences = useMemo(() => highlights.map((text, index) => ({ index, text })), [highlights])
  const onMarked = useCallback((n: number, found: { index: number; found: boolean }[], first: HTMLElement | null) => {
    if (marked.current.for !== highlights) marked.current = fresh(highlights)
    if (first && !marked.current.scrolled) {                     // bring the first mark into view, once
      marked.current.scrolled = true
      first.scrollIntoView?.({ block: 'center' })
      callbacks.current.onMarksShown?.(found.filter((f) => f.found).length)
    }
    const here = found.filter((f) => f.found).map((f) => ({ index: f.index, page: n }))
    const report = (list: { index: number; page: number }[]) => {
      marked.current.all = list
      if (marked.current.reported) return                        // a redraw (zoom, scrolling back) says nothing new
      marked.current.reported = true
      callbacks.current.onMarks?.(list, highlights.length)
    }
    if (n === cited) {
      marked.current.cited = here
      const rest = found.filter((f) => !f.found).map((f) => ({ index: f.index, text: highlights[f.index] }))
      if (rest.length === 0 || !doc || cited + 1 > doc.numPages) report(here)
      else setSpill((s) => (s && s.for === highlights && s.page === cited + 1 ? s : { for: highlights, page: cited + 1, sentences: rest }))
    } else {
      report([...marked.current.cited, ...here])                 // the next page got the rest
    }
    // showSentence was waiting for its page to be drawn: the mark exists now
    const waiting = marked.current.waiting
    if (waiting !== null) {
      const mark = region.current?.querySelector<HTMLElement>(`mark[data-sentence="${waiting}"]`)
      if (mark) { marked.current.waiting = null; mark.scrollIntoView?.({ block: 'center' }) }
    }
  }, [cited, highlights, doc])

  function goTo(p: number) {
    if (!doc) return
    const target = clampPage(String(p), doc.numPages)
    // already there (PageUp on page 1, End on the last page): just bring it back into view. Setting `jump` here
    // would never be cleared (no page change, no effect run) and scrolling would stop updating the page.
    if (target === visible) { slot(target)?.scrollIntoView?.({ block: 'start' }); return }
    jump.current = target
    setVisible(target)
  }

  useImperativeHandle(ref, () => ({
    showSentence(index: number) {
      const mark = region.current?.querySelector<HTMLElement>(`mark[data-sentence="${index}"]`)
      if (mark) { mark.scrollIntoView?.({ block: 'center' }); return }
      // its page is not drawn: go there like a key press would, and scroll once the mark appears
      const page = marked.current.all.find((f) => f.index === index)?.page
      if (page === undefined) return
      marked.current.waiting = index
      goTo(page)
    },
  }))

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

  /** where the screen point (x, y) sits on the drawn page under it (or the current page) */
  function placeAt(x: number, y: number): Place {
    const box = region.current!.getBoundingClientRect()
    const n = [...draw].find((p) => { const r = slot(p)?.getBoundingClientRect(); return r && y >= r.top && y < r.bottom }) ?? current.current
    const page = slot(n)?.getBoundingClientRect() ?? box
    return { n, scroll: { left: box.left - page.left, top: -page.top }, focus: { x: x - box.left, y }, scale }
  }

  /** commit a zoom; the layout effect above keeps `place` where it was */
  function zoomTo(next: number, place: Place) {
    if (next === zoom) { if (sheet.current) sheet.current.style.transform = ''; return }   // nothing to redraw
    anchor.current = place
    setZoom(next)
  }

  /** zoom from the buttons, around the middle of what is on screen */
  function zoomButton(next: number) {
    const box = region.current!.getBoundingClientRect()
    zoomTo(next, placeAt(box.left + region.current!.clientWidth / 2, Math.max(box.top, 0) / 2 + Math.min(box.bottom, window.innerHeight) / 2))
  }

  // touch only (a mouse drag selects text): one finger scrolls natively and may be a tap; two fingers pinch
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    tap.current = fingers.current.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null
    if (fingers.current.size !== 2 || !sheet.current || !doc) return   // no pinch while the PDF is still loading
    const [a, b] = [...fingers.current.values()]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const box = sheet.current.getBoundingClientRect()
    sheet.current.style.transformOrigin = `${mid.x - box.left}px ${mid.y - box.top}px`   // grow around the point between the fingers
    gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom, now: zoom, place: placeAt(mid.x, mid.y) }
  }

  function onPointerMove(e: React.PointerEvent) {
    const finger = fingers.current.get(e.pointerId)
    if (!finger) return
    finger.x = e.clientX
    finger.y = e.clientY
    const t = tap.current
    if (t && t.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) >= TAP.move) tap.current = null
    const g = gesture.current
    if (!g || fingers.current.size < 2 || !sheet.current) return
    const [a, b] = [...fingers.current.values()]
    g.now = pinchZoom(g, Math.hypot(a.x - b.x, a.y - b.y), { min: Math.min(minZoom, g.zoom), max: Math.max(MAX_ZOOM, g.zoom) })
    sheet.current.style.transform = `scale(${g.now / g.zoom})`   // instant: no React render per finger move
  }

  function onPointerEnd(e: React.PointerEvent) {
    if (!fingers.current.delete(e.pointerId)) return
    const t = tap.current
    tap.current = null
    if (e.type === 'pointerup' && t?.id === e.pointerId && performance.now() - t.t < TAP.ms
      && Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP.move) callbacks.current.onTap?.()
    const g = gesture.current
    if (g) { gesture.current = null; zoomTo(g.now, g.place) }   // a finger lifts: the pinch is over, redraw sharp at the new size
  }

  return (
    <div className={styles.view}>
      {/* tabIndex: the keyboard can focus the pages and move through them */}
      {/* the pointer handlers are on the pages area only: the toolbar and the reading strip never zoom */}
      <div ref={region} className={styles.pages} role="region" aria-label="PDF pages" tabIndex={0} onKeyDown={onKeyDown}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <div ref={sheet} className={styles.sheet}>
          {doc && Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
            <PageSlot key={n} doc={doc} n={n} scale={scale} draw={draw.has(n)} onMarked={onMarked} label={label}
              highlights={n === cited ? citedSentences : spill && n === spill.page ? spill.sentences : NONE}
              width={Math.floor(base.width * scale)} height={Math.floor(base.height * scale)} />
          ))}
        </div>
      </div>
      {doc && width >= WIDE && (
        <div className={styles.zoom} role="group" aria-label="Zoom">
          <IconButton icon={Minus} label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => zoomButton(nextZoomStep(zoom, -1))} />
          <IconButton icon={Maximize} label="Fit to width" disabled={zoom === 1} onClick={() => zoomButton(1)} />
          <IconButton icon={Plus} label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => zoomButton(nextZoomStep(zoom, 1))} />
        </div>
      )}
    </div>
  )
}
