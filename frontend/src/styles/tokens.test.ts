// The colours are checked by code, not by eye: WCAG 2.2 AA needs text >= 4.5:1 and
// control borders / focus rings >= 3:1, in light AND dark.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = resolve(process.cwd(), 'src/styles')
const tokens = readFileSync(resolve(here, 'tokens.css'), 'utf8')
const base = readFileSync(resolve(here, 'base.css'), 'utf8')

/** The hex values declared inside the block whose selector contains `selector`. */
function block(selector: string): Record<string, string> {
  const start = tokens.indexOf(selector)
  if (start < 0) throw new Error(`no block for ${selector}`)
  const body = tokens.slice(tokens.indexOf('{', start) + 1, tokens.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe.each([
  ['light', 'html[data-mode="light"]'],
  ['dark', 'html[data-mode="dark"]'],
])('%s mode', (_mode, selector) => {
  const t = block(selector)
  it.each([
    ['--ink', '--surface', 4.5],
    ['--ink', '--bg', 4.5],
    ['--muted', '--surface', 4.5],
    ['--muted', '--bg', 4.5],
    ['--muted', '--side', 4.5],
    ['--on-accent', '--accent', 4.5],
    ['--accent', '--surface', 4.5],
    ['--err', '--surface', 4.5],
    ['--ok', '--surface', 4.5],
    ['--line-strong', '--surface', 3],
    ['--focus', '--bg', 3],
    ['--focus', '--surface', 3],
  ])('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(t[fg], `${fg} missing`).toBeDefined()
    expect(t[bg], `${bg} missing`).toBeDefined()
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min as number)
  })
})

describe('base.css', () => {
  it('lets long words wrap instead of overflowing', () => {
    expect(base).toContain('overflow-wrap: anywhere')
  })
  it('turns motion off for people who ask for less motion', () => {
    expect(base).toContain('prefers-reduced-motion')
  })
})

describe('focus on the question box', () => {
  // The textarea hides its own outline, so the whole composer must show the 2px focus ring instead
  // (found in the keyboard-only check: the box had only a 1px colour change).
  it('the composer shows the focus ring while its textarea has focus', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/chat/Chat.module.css'), 'utf8')
    const rule = css.match(/\.composer:focus-within\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/outline:\s*2px solid var\(--focus\)/)
  })
})
