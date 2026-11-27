/**
 * The one place that touches PDF.js (pinned pdfjs-dist 6.5.438). Everything else uses these few functions,
 * so tests can replace this module with a fake document.
 *
 * Security: v6 has no eval-based font code any more (the old `isEvalSupported` switch is gone), and our CSP
 * (`script-src 'self'`, no unsafe-eval) would block eval anyway. The worker is a file from our own build.
 */
import { getDocument, GlobalWorkerOptions, InvalidPDFException, PasswordException, ResponseException, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = PDFDocumentProxy

/**
 * Files PDF.js loads on demand, served from our own origin by the `pdfAssets` Vite plugin. Without them, scanned
 * pages (JBIG2, JPEG 2000 images: decoded by WebAssembly in PDF.js 6) draw blank, and some Asian fonts fail.
 */
const base = `${import.meta.env.BASE_URL}pdfjs/`
export const PDF_ASSETS = {
  wasm: `${base}wasm/`, cmaps: `${base}cmaps/`, standardFonts: `${base}standard_fonts/`, iccs: `${base}iccs/`,
}

/** Opens a PDF by URL: pages arrive in pieces when the server allows it, the rest is fetched in the background. */
export function openPdf(url: string) {
  return getDocument({
    url, disableAutoFetch: false, rangeChunkSize: 65536,
    wasmUrl: PDF_ASSETS.wasm, cMapUrl: PDF_ASSETS.cmaps, standardFontDataUrl: PDF_ASSETS.standardFonts, iccUrl: PDF_ASSETS.iccs,
  })
}

/**
 * Why a PDF failed to load:
 * - expired: Storage refused the link (400/401/403/404): get a new link
 * - broken: the file itself can't be drawn (damaged, or locked with a password): trying again cannot help
 * - failed: anything else, e.g. the network dropped during the download: worth trying again
 */
export function loadErrorKind(error: unknown): 'expired' | 'broken' | 'failed' {
  if (error instanceof ResponseException) return 'expired'
  if (error instanceof InvalidPDFException || error instanceof PasswordException) return 'broken'
  return 'failed'
}

export { TextLayer }
