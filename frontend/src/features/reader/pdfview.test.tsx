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
    render() { return Promise.resolve() }
    cancel() {}
  },
}))
vi.mock('./pdf', () => pdf)

import { PdfView } from './PdfView'

const fakePage = (text: string[] = []) => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, rawDims: { pageWidth: 600, pageHeight: 800 } }),
  render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  getTextContent: () => Promise.resolve({ items: text.map((str) => ({ str })), styles: {} }),
  cleanup: vi.fn(),
})
const fakeDoc = (numPages: number, text: Record<number, string[]> = {}) =>
  ({ numPages, getPage: vi.fn((n: number) => Promise.resolve(fakePage(text[n]))), destroy: vi.fn() })
const opened = (doc: unknown) => ({ promise: Promise.resolve(doc), destroy: vi.fn() })

function view(page: number, extra: Partial<Parameters<typeof PdfView>[0]> = {}) {
  const props = { url: 'https://x/signed', page, highlights: [] as string[], onPageChange: vi.fn(), onExpired: vi.fn(), onBroken: vi.fn(), onFailed: vi.fn(),
    onHighlightMissing: vi.fn(), ...extra }
  const utils = render(<PdfView {...props} />)
  return { ...utils, props }
}

beforeEach(() => {
  vi.resetAllMocks()
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
    expect(props.onHighlightMissing).not.toHaveBeenCalled()
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

  it('a sentence that starts on the cited page and is found on the next page is marked there', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Something else.'], 113: ['Normal adult blood pressure is below 120 mmHg.'] })))
    const { container, props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(container.querySelectorAll('[data-page="113"] mark')).toHaveLength(1))
    expect(props.onHighlightMissing).not.toHaveBeenCalled()
  })

  it('not found on the cited page or the next: onHighlightMissing, once, with 0 of 1 found', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Something else.'], 113: ['Other text.'] })))
    const { props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(props.onHighlightMissing).toHaveBeenCalledTimes(1))
    expect(props.onHighlightMissing).toHaveBeenCalledWith(0, 1)
  })

  it('some found, some not: onHighlightMissing says how many were found (final review: "not found" read as none)', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Normal adult blood pressure is below 120 mmHg.'], 113: ['Other text.'] })))
    const { props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.', 'Fever starts at 38 degrees Celsius.'] })
    await waitFor(() => expect(props.onHighlightMissing).toHaveBeenCalledTimes(1))
    expect(props.onHighlightMissing).toHaveBeenCalledWith(1, 2)
  })

  it('the last page: nothing to spill to, so the count comes from that page alone', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(2, { 2: ['Normal adult blood pressure is below 120 mmHg.'] })))
    const { props } = view(2, { highlights: ['Normal adult blood pressure is below 120 mmHg.', 'Fever starts at 38 degrees Celsius.'] })
    await waitFor(() => expect(props.onHighlightMissing).toHaveBeenCalledWith(1, 2))
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
})
