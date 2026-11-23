import { describe, expect, it } from 'vitest'
import { formatAdded } from './formatAdded'

const now = new Date('2026-11-23T12:00:00Z')

describe('formatAdded (the "Added" column)', () => {
  it('this year: month and day only', () => {
    expect(formatAdded('2026-11-20T12:00:00Z', now, 'en-US')).toBe('Nov 20')
  })

  it('another year: the year too, so an old file is not mistaken for a new one', () => {
    expect(formatAdded('2025-03-04T12:00:00Z', now, 'en-US')).toBe('Mar 4, 2025')
  })
})
