/**
 * Content Security Policy: the browser refuses any script, connection or form target not listed here.
 * A second wall behind React's escaping: even if markup got into the page, it could not run or phone home.
 *
 * Added as a <meta> tag to the PRODUCTION build only: the dev server and React fast-refresh insert an inline
 * script that "script-src 'self'" would block. When the app is hosted (Phase 8) this becomes a real HTTP
 * header, where frame-ancestors also works (browsers ignore frame-ancestors in a <meta> tag).
 */
import type { Plugin } from 'vite'

export function buildCsp(apiUrl: string, supabaseUrl: string): string {
  const origin = (url: string) => new URL(url).origin     // only scheme://host:port, never a path
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",    // style attributes from React and Motion; styles cannot run code
    "img-src 'self' data:",
    "font-src 'self'",                     // DM Sans is bundled: no font CDN
    `connect-src 'self' ${origin(apiUrl)} ${origin(supabaseUrl)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function cspPlugin(apiUrl: string, supabaseUrl: string): Plugin {
  const policy = buildCsp(apiUrl, supabaseUrl)
  return {
    name: 'eryysyn-csp',
    apply: 'build',
    transformIndexHtml: (html: string) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}
