import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReadingStrip } from './ReadingStrip'

const two = [
  { index: 0, text: 'Normal adult blood pressure is below 120 mmHg.', page: 8 },
  { index: 3, text: 'Fever starts at 38 degrees Celsius.', page: 9 },
]

describe('ReadingStrip', () => {
  it('shows the first marked sentence with its page and the count', () => {
    render(<ReadingStrip label={1} sentences={two} state="marks" onShow={vi.fn()} />)
    expect(screen.getByText('Normal adult blood pressure is below 120 mmHg.')).toBeInTheDocument()
    expect(screen.getByText('For [1]')).toBeInTheDocument()
    expect(screen.getByText('p. 8')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
  })

  it('› shows the next one and asks the page to scroll to it; ‹ goes back', async () => {
    const onShow = vi.fn()
    render(<ReadingStrip label={1} sentences={two} state="marks" onShow={onShow} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next marked sentence' }))
    expect(screen.getByText('Fever starts at 38 degrees Celsius.')).toBeInTheDocument()
    expect(screen.getByText('p. 9')).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    expect(onShow).toHaveBeenLastCalledWith(3)                       // the sentence's own index, not its place in the strip
    await userEvent.click(screen.getByRole('button', { name: 'Previous marked sentence' }))
    expect(screen.getByText('Normal adult blood pressure is below 120 mmHg.')).toBeInTheDocument()
    expect(onShow).toHaveBeenLastCalledWith(0)
  })

  it('one sentence: no counter, no arrows', () => {
    render(<ReadingStrip label={2} sentences={[two[0]]} state="marks" onShow={vi.fn()} />)
    expect(screen.getByText('For [2]')).toBeInTheDocument()
    expect(screen.queryByText(/ of /)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('no supporting sentence: says the chat card has the whole passage', () => {
    render(<ReadingStrip label={1} sentences={[]} state="no-sentence" onShow={vi.fn()} />)
    expect(screen.getByText('No single sentence is marked for [1]: the chat card has the whole passage.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('none found on the page: points to the chat card', () => {
    render(<ReadingStrip label={1} sentences={[]} state="none-on-page" onShow={vi.fn()} />)
    expect(screen.getByText('Not found on this page: the sentence is marked in the chat card.')).toBeInTheDocument()
  })
})
