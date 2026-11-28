import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../shared/http'

// The route only composes: the Reader shows its Back link, the panels are not needed here.
vi.mock('../features/reader/ReaderPage', () => ({
  ReaderPage: ({ back, label }: { back: { to: string; label: string }; label?: number }) => (
    <><a href={back.to}>{back.label}</a><p>label {String(label)}</p></>
  ),
}))
vi.mock('../features/chat/ReaderChat', () => ({ ReaderChat: () => null }))
vi.mock('../features/chat/ReaderSource', () => ({ ReaderSource: () => null }))
vi.mock('../features/library/hooks', () => ({ useDocuments: () => ({ data: [] }) }))
const chat = vi.hoisted(() => ({ useConversation: vi.fn() }))
vi.mock('../features/chat/hooks', () => chat)

import { ReaderRoute } from './ReaderRoute'

function open(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/documents/:id" element={<ReaderRoute />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('ReaderRoute Back link', () => {
  it('from a chat: Back to chat', async () => {
    chat.useConversation.mockReturnValue({ data: { messages: [] }, error: null })
    open('/documents/d1?chat=c1')
    expect(await screen.findByRole('link', { name: 'Back to chat' })).toHaveAttribute('href', '/chat/c1')
  })

  it('from the Library: Back to Library', async () => {
    chat.useConversation.mockReturnValue({ data: undefined, error: null })
    open('/documents/d1')
    expect(await screen.findByRole('link', { name: 'Back to Library' })).toHaveAttribute('href', '/library')
  })

  it('a chat that is gone or not yours: Back to Library, not back to a dead chat (final review)', async () => {
    chat.useConversation.mockReturnValue({ data: undefined, error: new ApiError('not_found', 404, 'gone') })
    open('/documents/d1?chat=gone')
    expect(await screen.findByRole('link', { name: 'Back to Library' })).toHaveAttribute('href', '/library')
  })
})

describe('ReaderRoute citation number', () => {
  it('passes the citation number to the Reader', async () => {
    chat.useConversation.mockReturnValue({
      data: { messages: [{ id: 'a1', role: 'assistant', content: 'Normal blood pressure is below 120 mmHg [2].', citations: [{ n: 2, excerpt: 'Normal blood pressure is below 120 mmHg.', filename: 'x.pdf' }] }] },
      error: null,
    })
    open('/documents/d1?chat=c1&answer=a1&n=2')
    expect(await screen.findByText('label 2')).toBeInTheDocument()
  })

  it('opened from the Library: no number', async () => {
    chat.useConversation.mockReturnValue({ data: undefined, error: null })
    open('/documents/d1')
    expect(await screen.findByText('label undefined')).toBeInTheDocument()
  })
})
