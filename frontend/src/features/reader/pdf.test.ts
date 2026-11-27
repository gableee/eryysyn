import { describe, expect, it, vi } from 'vitest'

// getDocument is replaced so the test sees the options; the exception classes stay the real PDF.js ones.
const getDocument = vi.hoisted(() => vi.fn(() => ({ promise: new Promise(() => {}), destroy: vi.fn() })))
vi.mock('pdfjs-dist', async (real) => ({ ...(await real<typeof import('pdfjs-dist')>()), getDocument }))

import { AbortException, InvalidPDFException, PasswordException, ResponseException } from 'pdfjs-dist'
import { loadErrorKind, openPdf, PDF_ASSETS } from './pdf'

describe('loadErrorKind (final review: a dropped download looked like a damaged file)', () => {
  it('a refused or expired link (HTTP error from Storage): expired, get a new link', () => {
    expect(loadErrorKind(new ResponseException('Unexpected server response (400)', 400, true))).toBe('expired')
  })

  it.each([
    ['a damaged file', new InvalidPDFException('Invalid PDF structure.')],
    ['a password-protected file', new PasswordException('No password given', 1)],
  ])('%s: broken, trying again cannot help', (_, error) => {
    expect(loadErrorKind(error)).toBe('broken')
  })

  it.each([
    ['the network dropped', new TypeError('Failed to fetch')],
    ['anything PDF.js does not name', new Error('Unknown error')],
    ['an aborted load', new AbortException('Loading aborted')],
  ])('%s: failed, worth trying again', (_, error) => {
    expect(loadErrorKind(error)).toBe('failed')
  })
})

describe('openPdf', () => {
  it('tells PDF.js where its decoders, character maps and fonts are (final review: scanned pages drew blank)', () => {
    openPdf('https://x/signed')
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://x/signed',
      wasmUrl: PDF_ASSETS.wasm, cMapUrl: PDF_ASSETS.cmaps, standardFontDataUrl: PDF_ASSETS.standardFonts, iccUrl: PDF_ASSETS.iccs,
    }))
    for (const url of Object.values(PDF_ASSETS)) expect(url).toMatch(/^\/pdfjs\/[a-z_]+\/$/)   // our own origin, trailing slash
  })
})
