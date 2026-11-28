import { describe, expect, it } from 'vitest'
import { columnScale, textColumn } from './textColumn'

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
  it('fills the view minus the padding on both sides', () => {
    expect(columnScale(360, { left: 72, right: 540 })).toBeCloseTo((360 - 24) / 468)
    expect(columnScale(360, { left: 72, right: 540 }, 0)).toBeCloseTo(360 / 468)
  })
})
