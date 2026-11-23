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
  const props = { url: 'https://x/signed', page, highlights: [] as string[], onPageChange: vi.fn(), onExpired: vi.fn(), onBroken: vi.fn(),
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

  it('a sentence that starts on the cited page and is found on the next page is marked there', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Something else.'], 113: ['Normal adult blood pressure is below 120 mmHg.'] })))
    const { container, props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(container.querySelectorAll('[data-page="113"] mark')).toHaveLength(1))
    expect(props.onHighlightMissing).not.toHaveBeenCalled()
  })

  it('not found on the cited page or the next: onHighlightMissing, once', async () => {
    pdf.openPdf.mockReturnValue(opened(fakeDoc(340, { 112: ['Something else.'], 113: ['Other text.'] })))
    const { props } = view(112, { highlights: ['Normal adult blood pressure is below 120 mmHg.'] })
    await waitFor(() => expect(props.onHighlightMissing).toHaveBeenCalledTimes(1))
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
})
