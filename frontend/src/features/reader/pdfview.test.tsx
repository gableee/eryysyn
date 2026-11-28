import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PDF.js itself is replaced by a fake document at the module boundary (jsdom can't draw PDFs).
const pdf = vi.hoisted(() => ({
  openPdf: vi.fn(),
  loadErrorKind: vi.fn(),
  TextLayer: class {
    textDivs: HTMLElement[] = []
    textContentItemsStr: string[] = []
    constructor({ textContentSource, container }: { textContentSource: { items: { str: string }[] }; container: HTMLElement }) {
      for (const item of textContentSource.items) {
        const span = document.createElement('span')
        span.textContent = item.str
        container.append(span)
        this.textDivs.push(span)
        this.textContentItemsStr.push(item.str)
      }
    }
    render() { return pdf.gate.wait }
    cancel() {}
  },
  gate: { wait: Promise.resolve() as Promise<void> },   // a test can hold every text layer back (a page mid-redraw), then let go
}))
vi.mock('./pdf', () => pdf)

import { createRef } from 'react'
import { PdfView, type PdfViewHandle } from './PdfView'

type FakeItem = { str: string; transform?: number[]; width?: number }
const events: string[] = []   // 'text:<n>' / 'render:<n>' in the order PdfView asked, to prove the text is read before any drawing
const fakePage = (text: (string | FakeItem)[] = [], n = 0) => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, rawDims: { pageWidth: 600, pageHeight: 800 } }),
  render: () => { events.push(`render:${n}`); return { promise: Promise.resolve(), cancel: vi.fn() } },
  getTextContent: () => { events.push(`text:${n}`); return Promise.resolve({ items: text.map((t) => (typeof t === 'string' ? { str: t } : t)), styles: {} }) },
  cleanup: vi.fn(),
})
const fakeDoc = (numPages: number, text: Record<number, (string | FakeItem)[]> = {}) =>
  ({ numPages, getPage: vi.fn((n: number) => Promise.resolve(fakePage(text[n], n))), destroy: vi.fn() })
const opened = (doc: unknown) => ({ promise: Promise.resolve(doc), destroy: vi.fn() })

function view(page: number, extra: Partial<Parameters<typeof PdfView>[0]> = {}) {
  const props = { url: 'https://x/signed', page, highlights: [] as string[], onPageChange: vi.fn(), onExpired: vi.fn(), onBroken: vi.fn(), onFailed: vi.fn(),
    onMarks: vi.fn(), ...extra }
  const utils = render(<PdfView {...props} />)
  return { ...utils, props }
}

beforeEach(() => {
  vi.resetAllMocks()
  events.length = 0
  pdf.gate.wait = Promise.resolve()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
})
afterEach(() => vi.restoreAllMocks())

describe('PdfView', () => {
  it('opens the whole document at the requested page', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
    const { props } = view(112)
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
    expect(pdf.openPdf).toHaveBeenCalledWith('https://x/signed')
  })

  it('takes keyboard focus when it opens, so PageDown works at once (found in the keyboard check)', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
    const { props } = view(112)
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
    expect(screen.getByRole('region', { name: 'PDF pages' })).toHaveFocus()
  })

  it('a page past the end opens the last page', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
    const { props } = view(999)
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(340, 340, true))
  })

  it('PageDown and PageUp move one page; Home and End jump', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
    const { props } = view(112)
    const pages = await screen.findByRole('region', { name: 'PDF pages' })
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))   // opened first
    fireEvent.keyDown(pages, { key: 'PageDown' })
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(113, 340, true))
    fireEvent.keyDown(pages, { key: 'PageUp' })
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
    fireEvent.keyDown(pages, { key: 'End' })
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(340, 340, true))
    fireEvent.keyDown(pages, { key: 'Home' })
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(1, 340, true))
  })

  it('never draws more than 5 pages, however far you move', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
    const { container, props } = view(112)
    const pages = await screen.findByRole('region', { name: 'PDF pages' })
    await waitFor(() => expect(props.onPageChange).toHaveBeenCalled())
    for (let i = 0; i < 6; i++) fireEvent.keyDown(pages, { key: 'PageDown' })
    await waitFor(() => expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0))
    expect(container.querySelectorAll('canvas').length).toBeLessThanOrEqual(5)
    expect(container.querySelectorAll('[data-page]').length).toBe(340)        // every page keeps its place
  })

  it('keeps your page when the width changes (phones measure their width after the first layout)', async () => {
    let resize: ((entries: { contentRect: { width: number } }[]) => void) | undefined
    vi.stubGlobal('ResizeObserver', class { constructor(cb: typeof resize) { resize = cb } observe() {} disconnect() {} })
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      scroll.mockClear()
      act(() => resize?.([{ contentRect: { width: 358 } }]))          // the real phone width arrives
      expect((scroll.mock.contexts.at(-1) as HTMLElement | undefined)?.dataset.page).toBe('112')
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
      vi.unstubAllGlobals()
    }
  })

  it('marks the supporting sentence on the cited page, as page text (never HTML)', async () => {
    const sentence = 'Normal adult blood pressure is below 120 mmHg.'
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Readings vary. Normal adult blood pres', 'sure is below 120 mmHg. Next.'] })))
    const { container, props } = view(112, { highlights: [sentence] })
    await waitFor(() => expect(container.querySelectorAll('[data-page="112"] mark')).toHaveLength(2))
    const marks = [...container.querySelectorAll('[data-page="112"] mark')].map((m) => m.textContent)
    expect(marks).toEqual(['Normal adult blood pres', 'sure is below 120 mmHg.'])
    await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
    expect(props.onMarks).toHaveBeenCalledWith([{ index: 0, page: 112 }], 1)
  })

  it('page marks carry their sentence index, and each found sentence gets a bar with the citation number', async () => {
    const sentence = 'Normal adult blood pressure is below 120 mmHg.'
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Readings vary. Normal adult blood pres', 'sure is below 120 mmHg. Next.'] })))
    const { container } = view(112, { highlights: [sentence], label: 1 })
    await waitFor(() => expect(container.querySelectorAll('[data-page="112"] mark[data-sentence="0"]')).toHaveLength(2))
    const bars = container.querySelectorAll('[data-page="112"] [data-bar]')
    expect(bars).toHaveLength(1)
    expect(bars[0].textContent).toBe('1')
    expect(bars[0].getAttribute('aria-hidden')).toBe('true')
  })

  it('a page without highlights has no bars', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Readings vary. Normal adult blood pres', 'sure is below 120 mmHg. Next.'] })))
    const { container, props } = view(112, { highlights: [], label: 1 })
    await waitFor(() => expect(props.onPageChange).toHaveBeenCalled())
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(0)
  })

  it('all found on the cited page: onMarks once with their page', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Normal adult blood pressure is below 120 mmHg.'], 113: ['Other text.'] })))
    const { props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
    expect(props.onMarks).toHaveBeenCalledWith([{ index: 0, page: 112 }], 1)
  })

  it('found only on the next page: reported with that page (a sentence that starts on the cited page is marked there)', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Something else.'], 113: ['Normal adult blood pressure is below 120 mmHg.'] })))
    const { container, props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(container.querySelectorAll('[data-page="113"] mark')).toHaveLength(1))
    await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
    expect(props.onMarks).toHaveBeenCalledWith([{ index: 0, page: 113 }], 1)
  })

  it('one on the cited page, one on the next: both, in page order', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Fever starts at 38 degrees Celsius.'], 113: ['Normal adult blood pressure is below 120 mmHg.'] })))
    const { props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.', 'Fever starts at 38 degrees Celsius.'] })
    await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
    expect(props.onMarks).toHaveBeenCalledWith([{ index: 1, page: 112 }, { index: 0, page: 113 }], 2)
  })

  it('found on neither page: onMarks with nothing found', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Something else.'], 113: ['Other text.'] })))
    const { props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
    expect(props.onMarks).toHaveBeenCalledWith([], 1)
  })

  it('the last page: nothing to spill to, so the report comes from that page alone', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(2, { 2: ['Normal adult blood pressure is below 120 mmHg.'] })))
    const { props } = view(2, { highlights: ['Normal adult blood pressure is below 120 mmHg.', 'Fever starts at 38 degrees Celsius.'] })
    await waitFor(() => expect(props.onMarks).toHaveBeenCalledWith([{ index: 0, page: 2 }], 2))
    expect(props.onMarks).toHaveBeenCalledTimes(1)
  })

  it("showSentence scrolls to that sentence's mark", async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Fever starts at 38 degrees Celsius. Normal adult blood pressure is below 120 mmHg.'] })))
      const ref = createRef<PdfViewHandle>()
      const { container, props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.', 'Fever starts at 38 degrees Celsius.'], ref })
      await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
      expect(container.querySelectorAll('[data-page="112"] mark')).toHaveLength(2)
      act(() => ref.current!.showSentence(1))
      const target = scroll.mock.contexts.at(-1) as HTMLElement
      expect(target.tagName).toBe('MARK')
      expect(target.dataset.sentence).toBe('1')
      expect(scroll).toHaveBeenLastCalledWith({ block: 'center', inline: 'nearest' })
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it('an expired link calls onExpired', async () => {
    pdf.openPdf.mockReturnValue({ promise: Promise.reject(new Error('400')), destroy: vi.fn() })
    pdf.loadErrorKind.mockReturnValue('expired')
    const { props } = view(1)
    await waitFor(() => expect(props.onExpired).toHaveBeenCalledTimes(1))
    expect(props.onBroken).not.toHaveBeenCalled()
  })

  it('a damaged file calls onBroken', async () => {
    pdf.openPdf.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy: vi.fn() })
    pdf.loadErrorKind.mockReturnValue('broken')
    const { props } = view(1)
    await waitFor(() => expect(props.onBroken).toHaveBeenCalledTimes(1))
  })

  it('a download that fails for another reason (e.g. the network dropped) calls onFailed, not onBroken (final review)', async () => {
    pdf.openPdf.mockReturnValue({ promise: Promise.reject(new Error('Failed to fetch')), destroy: vi.fn() })
    pdf.loadErrorKind.mockReturnValue('failed')
    const onFailed = vi.fn()
    const { props } = view(1, { onFailed })
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(props.onBroken).not.toHaveBeenCalled()
  })

  it('scrolling still moves the page after a key at the first page (final review: the page stuck and stayed blank)', async () => {
    let seen: ((entries: { target: Element; intersectionRatio: number }[]) => void) | undefined
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof seen) { seen = cb } observe() {} disconnect() {} })
    try {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { container, props } = view(1)
      const pages = await screen.findByRole('region', { name: 'PDF pages' })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(1, 340, true))
      fireEvent.keyDown(pages, { key: 'PageUp' })                      // already on page 1: nothing to move
      act(() => seen?.([{ target: container.querySelector('[data-page="5"]')!, intersectionRatio: 1 }]))   // then a scroll
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(5, 340, false))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not take focus from a question box the student is typing in while the PDF loads (final review)', async () => {
    let open: (doc: unknown) => void = () => {}
    pdf.openPdf.mockReturnValue({ promise: new Promise((resolve) => { open = resolve }), destroy: vi.fn() })
    const input = document.createElement('textarea')
    document.body.append(input)
    try {
      const { props } = view(112)
      input.focus()
      await act(async () => open(fakeDoc(340)))
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      expect(input).toHaveFocus()
    } finally {
      input.remove()
    }
  })

  it('a page that leaves the drawn window frees its PDF.js resources and its canvas memory (final review)', async () => {
    const doc = fakeDoc(340)
    const pages = new Map<number, ReturnType<typeof fakePage>>()
    doc.getPage.mockImplementation((n: number) => { const p = fakePage(); pages.set(n, p); return Promise.resolve(p) })
    pdf.openPdf.mockReturnValue(opened(doc))
    const { container, props } = view(112)
    await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
    await waitFor(() => expect(pages.get(112)).toBeDefined())
    const canvas = container.querySelector<HTMLCanvasElement>('[data-page="112"] canvas')!
    await waitFor(() => expect(canvas.width).toBeGreaterThan(0))
    fireEvent.keyDown(screen.getByRole('region', { name: 'PDF pages' }), { key: 'End' })
    await waitFor(() => expect(pages.get(112)!.cleanup).toHaveBeenCalled())
    expect(canvas.width).toBe(0)                                         // iOS counts a removed canvas until it is emptied
    expect(canvas.height).toBe(0)
  })

  it('cancelling a page while its text is being laid out is quiet (no unhandled rejection)', async () => {
    const original = pdf.TextLayer.prototype.render
    pdf.TextLayer.prototype.render = () => Promise.reject(Object.assign(new Error('TextLayer task cancelled.'), { name: 'AbortException' }))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      await new Promise((r) => setTimeout(r, 20))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
      pdf.TextLayer.prototype.render = original
    }
  })
  describe('showSentence waiting for a page to draw', () => {
    const sentences = ['Fever starts at 38 degrees Celsius.', 'Normal adult blood pressure is below 120 mmHg.']
    const marksScrolledTo = (scroll: ReturnType<typeof vi.fn>) =>
      scroll.mock.contexts.filter((el) => (el as HTMLElement).tagName === 'MARK').map((el) => (el as HTMLElement).dataset.sentence)
    /** opened on 112 with both marks, then End: page 112 is out of the drawn window, its marks are gone */
    async function awayFromMarks(scroll: ReturnType<typeof vi.fn>) {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: [sentences.join(' ')] })))
      const ref = createRef<PdfViewHandle>()
      const utils = view(112, { highlights: sentences, ref })
      await waitFor(() => expect(utils.props.onMarks).toHaveBeenCalledTimes(1))
      fireEvent.keyDown(screen.getByRole('region', { name: 'PDF pages' }), { key: 'End' })
      await waitFor(() => expect(utils.container.querySelectorAll('mark')).toHaveLength(0))
      scroll.mockClear()
      return { ...utils, ref }
    }
    const withScroll = async (body: (scroll: ReturnType<typeof vi.fn>) => Promise<void>) => {
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      try { await body(scroll) } finally { delete (Element.prototype as Partial<Element>).scrollIntoView }
    }

    it('a sentence on a page that is not drawn: goes there, then scrolls to the mark once it appears', () => withScroll(async (scroll) => {
      const { ref, container } = await awayFromMarks(scroll)
      act(() => ref.current!.showSentence(1))
      await waitFor(() => expect(marksScrolledTo(scroll)).toEqual(['1']))
      expect(container.querySelectorAll('[data-page="112"] mark')).toHaveLength(2)
    }))

    it('asking for another sentence while the page is still redrawing: only the last one is scrolled to', () => withScroll(async (scroll) => {
      const { ref, props } = await awayFromMarks(scroll)
      let release = () => {}
      pdf.gate.wait = new Promise<void>((r) => { release = r })     // page 112 starts drawing but its text is not there yet
      act(() => ref.current!.showSentence(0))
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      act(() => ref.current!.showSentence(1))                       // visible page, no mark in the DOM: nothing to scroll yet
      await act(async () => release())
      await waitFor(() => expect(marksScrolledTo(scroll)).toEqual(['1']))
    }))

    it('a sentence nobody found cancels the wait, so the redraw later does not scroll unexpectedly', () => withScroll(async (scroll) => {
      const { ref, props, container } = await awayFromMarks(scroll)
      let release = () => {}
      pdf.gate.wait = new Promise<void>((r) => { release = r })
      act(() => ref.current!.showSentence(0))
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      act(() => ref.current!.showSentence(7))                       // not a sentence of this citation
      await act(async () => release())
      await waitFor(() => expect(container.querySelectorAll('[data-page="112"] mark')).toHaveLength(2))
      expect(marksScrolledTo(scroll)).toEqual([])
    }))
  })

  describe('two-finger zoom (touch screens)', () => {
    afterEach(() => { document.documentElement.scrollTop = 0 })         // a zoom scrolls the page; start each test at the top
    const touch = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', el: Element, pointerId: number, clientX: number, clientY = 300) =>
      fireEvent[type](el, { pointerId, clientX, clientY, pointerType: 'touch', isPrimary: pointerId === 1 })
    const slotWidth = (c: HTMLElement) => (c.querySelector('[data-page="112"]') as HTMLElement).style.width
    /** two fingers 100px apart, spread to `to` px apart, then lifted */
    function pinch(el: Element, to: number) {
      touch('pointerDown', el, 1, 300)
      touch('pointerDown', el, 2, 400)
      touch('pointerMove', el, 2, 300 + to)
      touch('pointerUp', el, 2, 300 + to)
      touch('pointerUp', el, 1, 300)
    }

    it('two fingers spreading on the pages zoom in, and the pages redraw at the new size', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { container, props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const before = parseFloat(slotWidth(container))
      pinch(container.querySelector('[data-page="112"]')!, 200)
      expect(parseFloat(slotWidth(container))).toBe(Math.floor(before * 2))
    })

    it('a pinch that starts outside the pages area does nothing', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const props = { url: 'https://x/signed', page: 112, highlights: [] as string[], onPageChange: vi.fn(), onExpired: vi.fn(), onBroken: vi.fn(), onFailed: vi.fn() }
      const { container } = render(<><PdfView {...props} /><div data-testid="strip" /></>)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const before = slotWidth(container)
      pinch(screen.getByTestId('strip'), 200)
      expect(slotWidth(container)).toBe(before)
    })

    it('a finger whose end never arrives (its page piece was rebuilt mid-touch) does not turn the next tap into a pinch', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const onTap = vi.fn()
      const { container, props } = view(112, { onTap })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const region = screen.getByRole('region', { name: 'PDF pages' })
      const piece = document.createElement('span')
      container.querySelector('[data-page="112"]')!.append(piece)
      touch('pointerDown', piece, 1, 100)
      piece.remove()                                        // the text layer is redrawn: pointerup/cancel never reaches the pages area
      fireEvent.pointerDown(region, { pointerId: 5, clientX: 100, clientY: 300, pointerType: 'touch', isPrimary: true })   // the next touch is a new primary pointer
      fireEvent.pointerUp(region, { pointerId: 5, clientX: 102, clientY: 300, pointerType: 'touch', isPrimary: true })
      expect(onTap).toHaveBeenCalledTimes(1)
    })

    it('stops at 4 times the opening size', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { container, props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const before = parseFloat(slotWidth(container))
      pinch(container.querySelector('[data-page="112"]')!, 900)
      expect(parseFloat(slotWidth(container))).toBe(Math.floor(before * 4))
    })

    it('a quick one-finger tap calls onTap; a drag does not', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const onTap = vi.fn()
      const { container, props } = view(112, { onTap })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const page = container.querySelector('[data-page="112"]')!
      touch('pointerDown', page, 1, 100)
      touch('pointerUp', page, 1, 104)
      expect(onTap).toHaveBeenCalledTimes(1)
      touch('pointerDown', page, 1, 100)                 // a drag (the student scrolls)
      touch('pointerMove', page, 1, 130)
      touch('pointerUp', page, 1, 130)
      expect(onTap).toHaveBeenCalledTimes(1)
      touch('pointerDown', page, 1, 100)                 // a pinch, even without moving
      touch('pointerDown', page, 2, 200)
      touch('pointerUp', page, 2, 200)
      touch('pointerUp', page, 1, 100)
      expect(onTap).toHaveBeenCalledTimes(1)
      const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
      touch('pointerDown', page, 1, 100)                 // a long press
      now.mockReturnValue(1400)
      touch('pointerUp', page, 1, 100)
      expect(onTap).toHaveBeenCalledTimes(1)
    })

    it('two fingers on the pages stop the browser panning or zooming under them; one finger still scrolls natively', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { container, props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const page = container.querySelector('[data-page="112"]')!
      expect(fireEvent.touchMove(page, { touches: [{ clientX: 100 }, { clientX: 200 }] })).toBe(false)   // default prevented
      expect(fireEvent.touchMove(page, { touches: [{ clientX: 100 }] })).toBe(true)
    })

    it('a pinch while the PDF is still loading does nothing: it opens at the cited page, at the opening size (task review)', async () => {
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      try {
        let open: (doc: unknown) => void = () => {}
        pdf.openPdf.mockReturnValue({ promise: new Promise((resolve) => { open = resolve }), destroy: vi.fn() })
        const { container, props } = view(112)
        pinch(screen.getByRole('region', { name: 'PDF pages' }), 200)       // the grey loading area
        await act(async () => open(fakeDoc(340)))
        await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
        expect(scroll.mock.contexts.some((el) => (el as HTMLElement).dataset?.page === '112')).toBe(true)
        expect(slotWidth(container)).toBe(`${Math.floor(600 * (768 / 600))}px`)
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
    })

    it('a mouse does not pinch or tap (desktop drags select text)', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const onTap = vi.fn()
      const { container, props } = view(112, { onTap })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const page = container.querySelector('[data-page="112"]')!
      fireEvent.pointerDown(page, { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' })
      fireEvent.pointerUp(page, { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' })
      expect(onTap).not.toHaveBeenCalled()
    })

    it('the point between the fingers stays under them after the redraw', async () => {
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { container, props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const region = screen.getByRole('region', { name: 'PDF pages' })
      const scroller = document.scrollingElement ?? document.documentElement
      // a small layout: the pages area starts 56px down (under the toolbar), 800px wide; 16px padding and gaps
      const rect = (left: number, top: number, width: number, height: number) =>
        ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this === region) return rect(0, 56 - scroller.scrollTop, 800, 100_000)
        const n = Number(this.dataset.page)
        if (!n) return rect(0, 0, 0, 0)
        const w = parseFloat(this.style.width)
        const h = parseFloat(this.style.height)
        return rect(16 - region.scrollLeft, 56 + 16 + (n - 1) * (h + 16) - scroller.scrollTop, w, h)
      })
      const page = container.querySelector<HTMLElement>('[data-page="112"]')!
      scroller.scrollTop += page.getBoundingClientRect().top - 100         // page 112 starts 100px from the top of the screen
      const at = { x: 350, y: 300 }                                         // fingers centred here: 334px across, 200px down the page
      expect(page.getBoundingClientRect().top).toBe(100)
      touch('pointerDown', page, 1, 300, 300)
      touch('pointerDown', page, 2, 400, 300)
      touch('pointerMove', page, 2, 500, 300)                              // 100px apart -> 200px: twice the size
      touch('pointerUp', page, 2, 500, 300)
      touch('pointerUp', page, 1, 300, 300)
      const after = page.getBoundingClientRect()
      expect(after.left + 334 * 2).toBeCloseTo(at.x)
      expect(after.top + 200 * 2).toBeCloseTo(at.y)
    })

    it('the zoom buttons step from the current zoom', async () => {
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340)))
      const { container, props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const fit = 900 / 600                                                 // fit to width stops at 900px
      pinch(container.querySelector('[data-page="112"]')!, 110)            // zoom 1.1
      expect(slotWidth(container)).toBe(`${Math.floor(600 * fit * 1.1)}px`)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      expect(slotWidth(container)).toBe(`${Math.floor(600 * fit * 1.25)}px`)
      fireEvent.click(screen.getByRole('button', { name: 'Fit to width' }))
      expect(slotWidth(container)).toBe(`${Math.floor(600 * fit)}px`)
    })
  })

  describe('fit="column" (phones)', () => {
    const regionWidth = (w: number) => vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(w)

    it('the page opens scaled to its text column, scrolled to the column', async () => {
      regionWidth(360)
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: [{ str: 'Hello', transform: [1, 0, 0, 1, 72, 700], width: 468 }] })))
      const { container, props } = view(112, { fit: 'column' })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const scale = (360 - 22 - 12) / 468
      expect((container.querySelector('[data-page="112"]') as HTMLElement).style.width).toBe(`${Math.floor(600 * scale)}px`)
      // what the student sees: the text starts 22px from the view's left edge (the grid's own 16px padding counts)
      const scrolled = screen.getByRole('region', { name: 'PDF pages' }).scrollLeft
      const textLeft = 16 + 72 * scale - scrolled
      expect(textLeft).toBeCloseTo(22)
      expect(16 + 540 * scale - scrolled).toBeCloseTo(360 - 12)   // and the column's right edge is 12px inside the right edge
      // the margin bar sits 10px left of the text (4px wide) and its 16px number circle is centred on it: all on screen
      // (final review F3: with 12px the circle's left part was cut off)
      const barLeft = textLeft - 10
      expect(barLeft + 2 - 8).toBeGreaterThanOrEqual(0)
      // the text positions were read before any page was drawn, so there is no visible jump
      await waitFor(() => expect(events.some((e) => e.startsWith('render:'))).toBe(true))
      expect(events.indexOf('text:112')).toBeGreaterThanOrEqual(0)
      expect(events.indexOf('text:112')).toBeLessThan(events.findIndex((e) => e.startsWith('render:')))
    })

    it('the first draw is stable: the size observer reporting the content width changes nothing', async () => {
      regionWidth(360)
      let report: ((entries: unknown[]) => void) | null = null
      vi.stubGlobal('ResizeObserver', class { constructor(cb: (entries: unknown[]) => void) { report = cb } observe() {} disconnect() {} })
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: [{ str: 'Hello', transform: [1, 0, 0, 1, 72, 700], width: 468 }] })))
      const { container, props } = view(112, { fit: 'column' })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      const slotWidth = () => (container.querySelector('[data-page="112"]') as HTMLElement).style.width
      const before = slotWidth()
      act(() => report?.([{ contentRect: { width: 360 - 32 } }]))   // a real browser excludes the 16px padding on each side
      expect(slotWidth()).toBe(before)
      vi.unstubAllGlobals()
    })

    it('scrolling to a mark never moves the pages sideways: every mark scroll asks for the block only (final review F1)', async () => {
      regionWidth(360)
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      try {
        const sentences = ['Fever starts at 38 degrees Celsius.', 'Normal adult blood pressure is below 120 mmHg.']
        pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: [{ str: sentences.join(' '), transform: [1, 0, 0, 1, 72, 700], width: 468 }] })))
        const ref = createRef<PdfViewHandle>()
        const { container, props } = view(112, { fit: 'column', highlights: sentences, ref })
        await waitFor(() => expect(props.onMarks).toHaveBeenCalledTimes(1))
        const region = screen.getByRole('region', { name: 'PDF pages' })
        const left = region.scrollLeft                                   // where the column fit put the text
        act(() => ref.current!.showSentence(1))                          // its mark is drawn
        fireEvent.keyDown(region, { key: 'End' })                        // page 112 leaves the drawn window
        await waitFor(() => expect(container.querySelectorAll('mark')).toHaveLength(0))
        act(() => ref.current!.showSentence(0))                          // waits for page 112, then scrolls
        await waitFor(() => expect(scroll.mock.contexts.filter((el) => (el as HTMLElement).tagName === 'MARK')).toHaveLength(3))
        const markCalls = scroll.mock.calls.filter((_, i) => (scroll.mock.contexts[i] as HTMLElement).tagName === 'MARK')
        expect(markCalls).toEqual([[{ block: 'center', inline: 'nearest' }], [{ block: 'center', inline: 'nearest' }], [{ block: 'center', inline: 'nearest' }]])
        expect(region.scrollLeft).toBe(left)
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
    })

    it('no usable text: falls back to fit width', async () => {
      regionWidth(360)
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['no positions'] })))
      const { container, props } = view(112, { fit: 'column' })
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      expect((container.querySelector('[data-page="112"]') as HTMLElement).style.width).toBe(`${Math.floor(600 * ((360 - 64) / 600))}px`)
    })

    it('the default (width) ignores the text column', async () => {
      regionWidth(360)
      pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: [{ str: 'Hello', transform: [1, 0, 0, 1, 72, 700], width: 468 }] })))
      const { container, props } = view(112)
      await waitFor(() => expect(props.onPageChange).toHaveBeenLastCalledWith(112, 340, true))
      expect((container.querySelector('[data-page="112"]') as HTMLElement).style.width).toBe(`${Math.floor(600 * ((360 - 32) / 600))}px`)
    })
  })
})
