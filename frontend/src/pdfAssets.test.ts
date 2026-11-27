import { describe, expect, it, vi } from 'vitest'
import { pdfAssetFiles, pdfAssets } from '../pdfAssets'

type Handler = (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(body: Buffer): void }, next: () => void) => void

function devHandler(): Handler {
  let handler: Handler | undefined
  const plugin = pdfAssets()
  const server = { middlewares: { use: (path: string, h: Handler) => { expect(path).toBe('/pdfjs'); handler = h } } }
  ;(plugin.configureServer as (s: typeof server) => void)(server)
  return handler!
}

describe('PDF.js assets (final review: scanned pages drew blank without the decoders)', () => {
  it('ships the image decoders, character maps, standard fonts and colour profile', () => {
    const names = pdfAssetFiles().map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining([
      'wasm/openjpeg.wasm', 'wasm/openjpeg_nowasm_fallback.js',        // JPEG 2000 images
      'wasm/jbig2.wasm', 'wasm/jbig2_nowasm_fallback.js',              // scanned black-and-white pages
      'wasm/qcms_bg.wasm', 'iccs/CGATS001Compat-v2-micro.icc',         // colour management
      'cmaps/78-EUC-H.bcmap', 'standard_fonts/FoxitSerif.pfb', 'standard_fonts/LiberationSans-Regular.ttf',
    ]))
  })

  it('never ships the PDF scripting engine (we do not run JavaScript inside PDFs) or licence files as assets', () => {
    const names = pdfAssetFiles().map((f) => f.name)
    expect(names.some((n) => n.includes('quickjs'))).toBe(false)
    expect(names.some((n) => n.includes('LICENSE'))).toBe(false)
  })

  it('the production build emits them under pdfjs/', () => {
    const emitted: string[] = []
    const plugin = pdfAssets()
    ;(plugin.generateBundle as (this: unknown) => void).call({ emitFile: (f: { fileName: string }) => emitted.push(f.fileName) })
    expect(emitted).toContain('pdfjs/wasm/jbig2.wasm')
    expect(emitted).toHaveLength(pdfAssetFiles().length)
  })

  it('the dev server serves a known file with its type', () => {
    const res = { setHeader: vi.fn(), end: vi.fn() }
    const next = vi.fn()
    devHandler()({ url: '/wasm/jbig2.wasm' }, res, next)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/wasm')
    expect(res.end).toHaveBeenCalledWith(expect.any(Buffer))
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['/../package.json', '/wasm/../../package.json', '/wasm/quickjs-eval.wasm', '/nope/x.js', '/'])(
    'the dev server serves nothing outside the list: %s', (url) => {
      const res = { setHeader: vi.fn(), end: vi.fn() }
      const next = vi.fn()
      devHandler()({ url }, res, next)
      expect(next).toHaveBeenCalled()
      expect(res.end).not.toHaveBeenCalled()
    })
})
