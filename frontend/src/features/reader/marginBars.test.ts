import { describe, expect, it } from 'vitest'
import { barFor } from './marginBars'

describe('barFor', () => {
  it('one bar from the first line to the last, just left of the text', () => {
    expect(barFor([{ top: 100, bottom: 118, left: 72 }, { top: 120, bottom: 138, left: 60 }])).toEqual({ top: 100, height: 38, left: 50 })
  })

  it('never leaves the page on the left', () => {
    expect(barFor([{ top: 0, bottom: 10, left: 4 }])!.left).toBe(2)
  })

  it('no rectangles: no bar', () => {
    expect(barFor([])).toBeNull()
  })
})
