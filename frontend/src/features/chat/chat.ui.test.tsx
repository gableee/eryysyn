import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnswerMessage } from './AnswerMessage'
import { Composer } from './Composer'
import { PendingAnswer } from './PendingAnswer'
import { SourceCard } from './SourceCard'
import { SourcesPanel } from './SourcesPanel'
import type { ChatMessage, Citation } from './types'
import { UserMessage } from './UserMessage'

const cite = (n: number, extra: Partial<Citation> = {}): Citation => ({
  n, chunk_id: `c${n}`, document_id: 'd1', filename: 'ethics.pdf', page: 8,
  excerpt: 'A manufacturer can be found liable even if the product met all safety standards.', ...extra,
})
const answer = (content: string, citations: Citation[] = [cite(1)], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm2', role: 'assistant', content, refused: false, created_at: '', search_question: null, citations, ...extra,
})

afterEach(() => vi.useRealTimers())

describe('AnswerMessage', () => {
  it('model output is shown as text: no script, image or link is ever created', () => {
    const evil = '<script>alert(1)</script> <img src=x onerror=alert(1)> see https://free-grades.example.com [1]'
    const { container } = render(<AnswerMessage message={answer(evil)} onSelectCitation={vi.fn()} />)
    expect(container.querySelector('script, img, a, iframe')).toBeNull()
    expect(container).toHaveTextContent('<script>alert(1)</script>')
    expect(container).toHaveTextContent('https://free-grades.example.com')
  })

  it('a citation marker never wraps alone: it shares a no-wrap span with the word before it', () => {
    render(<AnswerMessage message={answer('The maker is liable [1].')} onSelectCitation={vi.fn()} />)
    const marker = screen.getByRole('button', { name: 'Source 1, ethics.pdf page 8' })
    const glue = marker.parentElement!
    expect(glue.className).toContain('glue')
    expect(glue).toHaveTextContent('liable')
  })

  it('two markers in a row keep the space between them', () => {
    const { container } = render(<AnswerMessage message={answer('Liable [1] [2].', [cite(1), cite(2)])} onSelectCitation={vi.fn()} />)
    expect(container.textContent).toBe('Liable\u00A01 2.')
  })

  it('clicking a marker reports its number', async () => {
    const onSelect = vi.fn()
    render(<AnswerMessage message={answer('Liable [1].')} onSelectCitation={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Source 1/ }))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('a refusal shows the next step', () => {
    render(<AnswerMessage message={answer('Not found in your documents.', [], { refused: true })} onSelectCitation={vi.fn()} />)
    expect(screen.getByText('Not found in your documents.')).toBeInTheDocument()
    expect(screen.getByText('Try other words, or check the document is in your Library.')).toBeInTheDocument()
  })
})

describe('UserMessage', () => {
  it('shows "Searched for" only when the question was rewritten', () => {
    const { rerender } = render(<UserMessage text="who does it apply to" searchQuestion="Who does strict liability apply to?" />)
    expect(screen.getByText('Searched for: Who does strict liability apply to?')).toBeInTheDocument()
    rerender(<UserMessage text="What is strict liability" searchQuestion="What is strict liability?" />)
    expect(screen.queryByText(/Searched for/)).not.toBeInTheDocument()
  })
})

describe('PendingAnswer', () => {
  it('adds the still-working line after 5 seconds', () => {
    vi.useFakeTimers()
    render(<PendingAnswer />)
    expect(screen.getByText('Ery is reading your documents…')).toBeInTheDocument()
    expect(screen.queryByText(/Still working/)).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Still working. Local models can take up to ~15 s.')).toBeInTheDocument()
  })
})

describe('sources', () => {
  it('a source whose document was deleted says so', () => {
    render(<SourceCard citation={cite(1, { document_id: null, chunk_id: null })} active={false} />)
    expect(screen.getByText('Source removed')).toBeInTheDocument()
  })

  it('a card shows file, page and the exact excerpt', () => {
    render(<SourceCard citation={cite(2)} active={false} />)
    expect(screen.getByText('ethics.pdf')).toBeInTheDocument()
    expect(screen.getByText('p. 8')).toBeInTheDocument()
    expect(screen.getByText(/found liable even if/)).toBeInTheDocument()
  })

  it.each(['panel', 'inline'] as const)('the %s view always tells you to check the page', (layout) => {
    render(<SourcesPanel citations={[cite(1)]} activeN={undefined} layout={layout} />)
    expect(screen.getByText('Check the cited page before relying on an answer.')).toBeInTheDocument()
  })

  it('the inline view says how many sources and starts open', () => {
    render(<SourcesPanel citations={[cite(1), cite(2)]} activeN={undefined} layout="inline" />)
    expect(screen.getByText('Sources (2)')).toBeInTheDocument()
    expect(screen.getAllByText(/found liable/)[0]).toBeVisible()   // open by default: excerpts visible
  })

  // Review fix: the login example shows a highlighted card; scrolling to it on first display pulled the phone
  // login page away from the form. Scroll only when the reader picks a citation.
  it('scrolls to a card only when a citation is picked, never on first display', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      const { rerender } = render(<SourcesPanel citations={[cite(1), cite(2)]} activeN={1} layout="inline" />)
      expect(scroll).not.toHaveBeenCalled()
      rerender(<SourcesPanel citations={[cite(1), cite(2)]} activeN={2} layout="inline" />)
      expect(scroll).toHaveBeenCalledTimes(1)
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })
})

describe('Composer', () => {
  it('Enter sends, Shift+Enter adds a line, blank never sends', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Composer onSend={onSend} disabled={false} />)
    const box = screen.getByRole('textbox', { name: 'Ask about your documents' })
    await user.type(box, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
    await user.type(box, 'What is{Shift>}{Enter}{/Shift}strict liability?{Enter}')
    expect(onSend).toHaveBeenCalledWith('What is\nstrict liability?')
    expect(box).toHaveValue('')
  })

  it('cannot send while disabled', async () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} disabled />)
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })
})
