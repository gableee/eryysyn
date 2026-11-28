import { describe, expect, it } from 'vitest'
import { anchorScroll, nextZoomStep, pinchZoom } from './pinch'

const limits = { min: 0.8, max: 4 }

describe('pinchZoom', () => {
  it('fingers spreading from 100px to 200px at zoom 1: zoom 2', () => {
    expect(pinchZoom({ distance: 100, zoom: 1 }, 200, limits)).toBe(2)
  })
  it('spreading past the maximum stops at 4', () => {
    expect(pinchZoom({ distance: 100, zoom: 2 }, 400, limits)).toBe(4)
  })
  it('pinching in below the minimum stops at the minimum', () => {
    expect(pinchZoom({ distance: 200, zoom: 1 }, 50, limits)).toBe(0.8)
  })
})

describe('anchorScroll', () => {
  it('keeps the point under the fingers where it was: (scroll + focus) * ratio - focus', () => {
    expect(anchorScroll({ left: 0, top: 1000 }, { x: 180, y: 300 }, 2)).toEqual({ left: 180, top: 2300 })
  })
})

describe('nextZoomStep', () => {
  it('steps from a zoom between the steps to the next one up or down', () => {
    expect(nextZoomStep(1.1, 1)).toBe(1.25)
    expect(nextZoomStep(1.1, -1)).toBe(1)
  })
  it('stops at the ends', () => {
    expect(nextZoomStep(4, 1)).toBe(4)
    expect(nextZoomStep(0.5, -1)).toBe(0.5)
  })
  it('from a step itself, goes to the neighbour', () => {
    expect(nextZoomStep(1, 1)).toBe(1.25)
    expect(nextZoomStep(1, -1)).toBe(0.75)
  })
})
