import { describe, expect, it } from 'vitest'
import { clampPage, pagesToDraw } from './pageWindow'

describe('clampPage (Review Focus 2: odd ?page values open a real page)', () => {
  it.each([
    ['999', 340, 340],
    ['0', 340, 1],
    ['abc', 340, 1],
    [null, 340, 1],
    ['112', 340, 112],
    ['12.7', 340, 12],
  ])('%s of %i pages -> %i', (raw, total, expected) => {
    expect(clampPage(raw, total)).toBe(expected)
  })
})

describe('pagesToDraw (only pages near the screen are drawn)', () => {
  it('the visible page and one on each side', () => { expect(pagesToDraw(112, 340)).toEqual([111, 112, 113]) })
  it('stays inside the document', () => {
    expect(pagesToDraw(1, 1)).toEqual([1])
    expect(pagesToDraw(1, 340)).toEqual([1, 2])
    expect(pagesToDraw(340, 340)).toEqual([339, 340])
  })
})
