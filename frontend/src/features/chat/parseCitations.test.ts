import { describe, expect, it } from 'vitest'
import { parseCitations } from './parseCitations'
import { showSearchedFor } from './searchedFor'

describe('parseCitations', () => {
  it('splits text and known markers', () => {
    expect(parseCitations('A is true [1]. B is true [2].', [1, 2])).toEqual([[
      { kind: 'text', text: 'A is true ' }, { kind: 'cite', n: 1 },
      { kind: 'text', text: '. B is true ' }, { kind: 'cite', n: 2 }, { kind: 'text', text: '.' },
    ]])
  })

  it('a marker with no matching source stays plain text', () => {
    expect(parseCitations('Invented [9].', [1])).toEqual([[{ kind: 'text', text: 'Invented [9].' }]])
  })

  it('a marker glued to a word (code like items[1]) stays text', () => {
    expect(parseCitations('use items[1] here [1]', [1])).toEqual([[
      { kind: 'text', text: 'use items[1] here ' }, { kind: 'cite', n: 1 },
    ]])
  })

  it('markers right after punctuation or another marker count', () => {
    expect(parseCitations('Both.[1][2]', [1, 2])).toEqual([[
      { kind: 'text', text: 'Both.' }, { kind: 'cite', n: 1 }, { kind: 'cite', n: 2 },
    ]])
  })

  it('blank lines split paragraphs; single line breaks stay in the text', () => {
    expect(parseCitations('One [1].\nStill one.\n\nTwo.', [1])).toEqual([
      [{ kind: 'text', text: 'One ' }, { kind: 'cite', n: 1 }, { kind: 'text', text: '.\nStill one.' }],
      [{ kind: 'text', text: 'Two.' }],
    ])
  })
})

describe('showSearchedFor', () => {
  it.each([
    ['why', null, false],                                                         // old message: nothing saved
    ['What is strict liability', 'What is strict liability?', false],             // only a "?" added
    ['what  is STRICT liability?', 'What is strict liability?', false],           // case and spacing
    ['who does it apply to', 'Who does strict liability apply to?', true],        // really rewritten
  ])('typed %j, searched %j -> %s', (typed, searched, expected) => {
    expect(showSearchedFor(typed, searched)).toBe(expected)
  })
})
