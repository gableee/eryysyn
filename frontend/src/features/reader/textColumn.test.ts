import { describe, expect, it } from 'vitest'
import { COLUMN_GAP, columnScale, textColumn } from './textColumn'

const item = (x: number, width: number, str = 'text') => ({ transform: [1, 0, 0, 1, x, 700], width, str })

describe('textColumn', () => {
  it('spans the leftmost to the rightmost text', () => {
    expect(textColumn([item(72, 400), item(90, 450)], 612)).toEqual({ left: 72, right: 540 })
  })
  it('ignores blank items', () => {
    expect(textColumn([item(72, 400), item(5, 600, '   '), item(0, 0, '')], 612)).toEqual({ left: 72, right: 472 })
  })
  it('no text, or a sliver: null', () => {
    expect(textColumn([], 612)).toBeNull()
    expect(textColumn([item(5, 600, ' ')], 612)).toBeNull()
    expect(textColumn([item(300, 50)], 612)).toBeNull()
  })
})

describe('columnScale', () => {
  it('fills the view minus the gaps: 22px on the left, room for the margin bar and its number (final review F3), 12px on the right', () => {
    expect(COLUMN_GAP).toEqual({ left: 22, right: 12 })
    expect(columnScale(360, { left: 72, right: 540 })).toBeCloseTo((360 - 34) / 468)
    expect(columnScale(360, { left: 72, right: 540 }, { left: 0, right: 0 })).toBeCloseTo(360 / 468)
  })
})
