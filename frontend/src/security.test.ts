import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCsp, cspPlugin, cspPluginsFor } from '../csp'

describe('Content Security Policy', () => {
  const csp = buildCsp('http://localhost:8000/api', 'https://abc.supabase.co')

  it('only runs our own scripts', () => {
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
  })

  it('only connects to our API and Supabase (origins, no paths)', () => {
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src'))
    expect(connect).toBe("connect-src 'self' http://localhost:8000 https://abc.supabase.co")
  })

  it('blocks plugins, foreign forms and <base> tricks', () => {
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('is added to the production build only, never to the dev server', () => {
    const plugin = cspPlugin('http://localhost:8000', 'https://abc.supabase.co')
    expect(plugin.apply).toBe('build')
    const html = (plugin.transformIndexHtml as (h: string) => string)('<html><head></head><body></body></html>')
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'')
  })
})

describe('vercel.json', () => {
  const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
  const headers = Object.fromEntries(
    vercel.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
  )

  it('serves index.html for every path, so reloading /chat/123 works', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
  })

  it('applies the security headers to every path', () => {
    expect(vercel.headers[0].source).toBe('/(.*)')
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'")
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()')
  })
})

describe('production builds without the URLs', () => {
  it('fail instead of silently shipping without a CSP', () => {
    expect(() => cspPluginsFor('build', {})).toThrow(/VITE_API_URL and VITE_SUPABASE_URL/)
  })
  it('the dev server and tests do not need them', () => {
    expect(cspPluginsFor('serve', {})).toEqual([])
  })
  it('a build with both URLs gets the CSP plugin', () => {
    expect(cspPluginsFor('build', { VITE_API_URL: 'http://a.test', VITE_SUPABASE_URL: 'https://b.test' })).toHaveLength(1)
  })
})
