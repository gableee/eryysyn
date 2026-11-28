// Layout rules that a screenshot found and a unit test can't measure (jsdom has no layout).
// The browser check measures the real result; these guard the rules that produce it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const rule = (css: string, selector: string) => css.match(new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? ''

const shell = read('src/app/AppShell.module.css')
const library = read('src/features/library/Library.module.css')
const chat = read('src/features/chat/Chat.module.css')
const reader = read('src/features/reader/Reader.module.css')
const auth = read('src/app/AuthLayout.module.css')

describe('wide screens: one alignment rule, nothing jumps between pages', () => {
  // Found at 1870px: the Library sat left of centre and moved 220px sideways when switching from New chat.
  it('the Library column is centred, like the chat column', () => {
    expect(rule(library, '.page')).toMatch(/margin-inline:\s*auto/)
  })

  it('the shell adds no extra wide-screen padding that pushes pages around', () => {
    expect(shell).not.toMatch(/min-width:\s*1600px/)
  })
})

describe('chat: sources are a docked panel, as in the mockup', () => {
  it('full height, its own background and a divider line', () => {
    const panel = rule(chat, '.panelColumn')
    expect(panel).toMatch(/(?:^|[\s;])height:\s*calc\(100dvh/)   // height, not max-height
    expect(panel).toMatch(/background:\s*var\(--side\)/)
    expect(panel).toMatch(/border-left:\s*1px solid var\(--line\)/)
  })
})

describe('empty and error states never stretch (review fix)', () => {
  // In a full-height page the grid rows of a state grew, and its "New chat" link became half a screen tall.
  it('a state keeps its rows at their natural height', () => {
    const states = read('src/shared/ui/States.module.css')
    expect(rule(states, '.state')).toMatch(/align-content:\s*start/)
  })
})

describe('library table rows', () => {
  // The uploading row has no buttons; its empty actions cell dropped to a second grid row and added a gap.
  it('an empty actions cell takes no place in the row', () => {
    expect(rule(library, '.actions:empty')).toMatch(/display:\s*none/)
  })
})

describe('touch targets on phones (critique P2)', () => {
  it('the card actions are at least 44px high under 600px', () => {
    const phone = chat.match(/@media \(max-width: 599px\) \{([^@]*?)\n\}/g)?.join('\n') ?? ''
    expect(phone).toMatch(/\.textButton,\s*\.pageLink\s*\{\s*min-height:\s*44px/)
  })
})

describe('the reading strip on phones', () => {
  it('a hidden strip is really hidden: its own display: grid must not beat the hidden attribute (final review F2b)', () => {
    expect(reader).toMatch(/^\.strip\[hidden\]\s*\{[^}]*display:\s*none/m)   // (rule() would read [hidden] as a regex class)
  })

  it('its arrows are at least 44px square', () => {
    expect(rule(reader, '.stripButton')).toMatch(/min-height:\s*44px/)
    expect(rule(reader, '.stripButton')).toMatch(/min-width:\s*44px/)
  })
})

describe('the Reader page marks (final review F1)', () => {
  // Found on a 390px phone: the margin kept on all four sides poked past the view, so the mark scroll ("nearest")
  // also scrolled the pages 42px sideways and hid the start of every line and the margin bar.
  it('a mark keeps room above and below when scrolled to, never at its sides', () => {
    const mark = rule(reader, '.pageMark')
    const sides = mark.match(/scroll-margin:\s*([^;]+)/)?.[1].trim().split(/\s+/) ?? []
    expect(sides).toEqual(['96px', '0'])                               // block 96px, inline 0
    expect(mark).not.toMatch(/scroll-margin-(?:inline|left|right)/)
  })
})

describe('login: nothing hugs one edge on a wide screen', () => {
  it('the form is centred in its half', () => {
    expect(rule(auth, '.formSide')).toMatch(/justify-items:\s*center/)
  })
})
