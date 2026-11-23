/**
 * The one place that touches PDF.js (pinned pdfjs-dist 6.5.438). Everything else uses these few functions,
 * so tests can replace this module with a fake document.
 *
 * Security: v6 has no eval-based font code any more (the old `isEvalSupported` switch is gone), and our CSP
 * (`script-src 'self'`, no unsafe-eval) would block eval anyway. The worker is a file from our own build.
 */
import { getDocument, GlobalWorkerOptions, ResponseException, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = PDFDocumentProxy

/** Opens a PDF by URL: pages arrive in pieces when the server allows it, the rest is fetched in the background. */
export function openPdf(url: string) {
  return getDocument({ url, disableAutoFetch: false, rangeChunkSize: 65536 })
}

/** Why a PDF failed to load: an expired or refused link (get a new one), or a file that can't be drawn. */
export function loadErrorKind(error: unknown): 'expired' | 'broken' {
  if (error instanceof ResponseException) return 'expired'   // 400/401/403 from Storage, or the link stopped working
  return 'broken'
}

export { TextLayer }
