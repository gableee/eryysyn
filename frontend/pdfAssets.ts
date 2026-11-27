/**
 * Files PDF.js 6 loads on demand, served from our own origin at /pdfjs/<folder>/<file>:
 * - wasm/: image decoders (JBIG2 = scanned black-and-white pages, JPEG 2000) and colour management, each with a
 *   plain-JavaScript fallback for browsers that block WebAssembly
 * - cmaps/: character maps for Chinese, Japanese and Korean fonts
 * - standard_fonts/: the 14 standard PDF fonts, for files that use them without embedding them
 * - iccs/: a colour profile
 * Without them, PDF.js draws those pages blank or with the wrong letters (found in the final review).
 *
 * The list is fixed when the plugin starts (only these folders, only these file types, no scripting engine),
 * so the dev server can never be asked for any other file on disk (no "../" path tricks).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

// import.meta.dirname: this file's folder (Node 20.11+; Vite and Vitest both provide it)
const ROOT = join(import.meta.dirname, 'node_modules', 'pdfjs-dist')
const FOLDERS = ['wasm', 'cmaps', 'standard_fonts', 'iccs']
const TYPES: Record<string, string> = {
  '.wasm': 'application/wasm', '.js': 'text/javascript', '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile',
}

export type PdfAsset = { name: string; path: string; type: string }

export function pdfAssetFiles(): PdfAsset[] {
  const files: PdfAsset[] = []
  for (const folder of FOLDERS) {
    for (const file of readdirSync(join(ROOT, folder))) {
      const type = TYPES[file.slice(file.lastIndexOf('.'))]
      if (!type || file.startsWith('quickjs')) continue      // licence texts; the PDF scripting engine (unused)
      files.push({ name: `${folder}/${file}`, path: join(ROOT, folder, file), type })
    }
  }
  return files
}

export function pdfAssets(): Plugin {
  const files = new Map(pdfAssetFiles().map((f) => [f.name, f]))
  return {
    name: 'eryysyn-pdf-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const file = files.get((req.url ?? '').split('?')[0].replace(/^\//, ''))
        if (!file) return next()
        res.setHeader('Content-Type', file.type)
        res.end(readFileSync(file.path))
      })
    },
    generateBundle() {
      for (const f of files.values()) this.emitFile({ type: 'asset', fileName: `pdfjs/${f.name}`, source: readFileSync(f.path) })
    },
  }
}
