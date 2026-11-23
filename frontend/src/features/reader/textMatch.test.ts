import { describe, expect, it } from 'vitest'
import { findTextRanges } from './textMatch'

const SENTENCE = 'Normal adult blood pressure is defined as a systolic pressure below 120 mmHg.'

describe('findTextRanges (where a sentence sits in the PDF text layer)', () => {
  it('finds a sentence split across pieces mid-word, across lines, with a line-break hyphen', () => {
    const items = ['Readings vary. Normal adult blood pres', 'sure is defined as a sys-', 'tolic pressure below 120 mmHg. Next one.']
    expect(findTextRanges(items, SENTENCE)).toEqual([
      { item: 0, start: 15, end: 38 },      // "Normal adult blood pres"
      { item: 1, start: 0, end: 25 },       // "sure is defined as a sys-"
      { item: 2, start: 0, end: 30 },       // "tolic pressure below 120 mmHg."
    ])
  })

  it('ignores differences in spacing, case and punctuation', () => {
    expect(findTextRanges(['NORMAL  adult blood-pressure is defined as a systolic pressure below 120 mmHg'], SENTENCE))
      .toEqual([{ item: 0, start: 0, end: 77 }])
  })

  it('returns nothing when the sentence is not on this page', () => {
    expect(findTextRanges(['Volcanoes erupt when magma rises.'], SENTENCE)).toEqual([])
    expect(findTextRanges([], SENTENCE)).toEqual([])
  })

  it('an empty or punctuation-only sentence matches nothing (never the whole page)', () => {
    expect(findTextRanges(['Anything at all.'], ' ... ')).toEqual([])
  })
})
