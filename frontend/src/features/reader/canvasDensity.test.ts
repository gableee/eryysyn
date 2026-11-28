import { describe, expect, it } from 'vitest'
import { canvasDensity } from './canvasDensity'

describe('canvasDensity', () => {
  it('a normal page keeps the screen density', () => {
    expect(canvasDensity(3, 400, 500)).toBe(3)
  })
  it('a page zoomed big on a 3x phone is drawn less dense, so its canvas stays within 16,777,216 pixels (iOS limit)', () => {
    const d = canvasDensity(3, 2448, 3168)
    expect(d).toBeLessThan(3)
    expect(d * d * 2448 * 3168).toBeLessThanOrEqual(16_777_216)
  })
  it('takes another limit', () => {
    expect(canvasDensity(2, 100, 100, 10_000)).toBe(1)
  })
})
