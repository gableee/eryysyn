import { Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import { clampPage, pagesToDraw } from './pageWindow'
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
  /** gives the parent the handle below (React 19: a ref is an ordinary prop) */
  ref?: Ref<PdfViewHandle>
}

export type PdfViewHandle = {
  /** scroll to the mark of one sentence (its index in `highlights`), going to its page first if that is not drawn */
  showSentence(index: number): void
}

const MAX_FIT_WIDTH = 900                 // "fit to width" stops here on very wide screens
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const PAD = 16                            // .pages padding on each side; the size observer reports the width inside it
const WIDE = 1000                         // zoom buttons only where there is room (touch screens pinch instead)
const NONE: { index: number; text: string }[] = []                 // one stable empty list, so idle pages never redraw

/** the width inside the pages' padding, the same measure the size observer reports (clientWidth minus both paddings) */
const contentWidth = (el: HTMLElement | null) => (el?.clientWidth ? el.clientWidth - 2 * PAD : 800)

/**
 * The whole PDF in one scroll column, opened at `page`. Every page has a slot of the right size, but only the
 * visible page and its neighbours are drawn, so a 340-page file stays light. Keys: PageUp/PageDown, ←/→, Home/End.
 */
export function PdfView({ url, page, highlights, label, onPageChange, onExpired, onBroken, onFailed, onMarks, onMarksShown, fit: fitMode = 'width', ref }: PdfViewProps) {
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [base, setBase] = useState({ width: 612, height: 792 })   // page 1 at scale 1 (US Letter until known)
  const [visible, setVisible] = useState(1)
  const [width, setWidth] = useState(0)
  const [column, setColumn] = useState<Column | null>(null)   // the opening page's text column (fit="column"), or null
  const [zoom, setZoom] = useState(1)
  const region = useRef<HTMLDivElement>(null)
  const slot = (n: number) => region.current?.querySelector<HTMLElement>(`[data-page="${n}"]`)
  const current = useRef(page)              // reopening after a renewed link keeps the student's place
  const jump = useRef<number | null>(null)
  const focused = useRef(false)
  const callbacks = useRef({ onPageChange, onExpired, onBroken, onFailed, onMarks, onMarksShown })
  useEffect(() => { callbacks.current = { onPageChange, onExpired, onBroken, onFailed, onMarks, onMarksShown } })
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

  // when the page size changes (the real width arrives, a phone rotates, zoom), stay on the same page
  // the opening fit is one number; zoom is a multiplier on it
  const fit = column ? columnScale(width + 2 * PAD, column) : Math.min(Math.max(width - 32, 200), MAX_FIT_WIDTH) / base.width
  const scale = fit * zoom
  // with a column fit the pages are wider than the view: start the sideways scroll at the text, not the paper edge
  useEffect(() => {
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
  const zoomIndex = ZOOMS.indexOf(zoom)

  return (
    <div className={styles.view}>
      {/* tabIndex: the keyboard can focus the pages and move through them */}
      <div ref={region} className={styles.pages} role="region" aria-label="PDF pages" tabIndex={0} onKeyDown={onKeyDown}>
        {doc && Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
          <PageSlot key={n} doc={doc} n={n} scale={scale} draw={draw.has(n)} onMarked={onMarked} label={label}
            highlights={n === cited ? citedSentences : spill && n === spill.page ? spill.sentences : NONE}
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
