import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http'
import type { ChatMessage, Citation, ConversationDetail } from './types'

vi.mock('../../shared/workspace', () => ({ useWorkspaceId: () => ({ workspaceId: 'w1', isLoading: false, error: null }) }))
const api = vi.hoisted(() => ({
  listConversations: vi.fn(), getConversation: vi.fn(), createConversation: vi.fn(), sendMessage: vi.fn(), listDocuments: vi.fn(),
}))
vi.mock('./api', () => api)

import { ReaderChat } from './ReaderChat'
import { ReaderSource } from './ReaderSource'

const cite: Citation = { n: 1, chunk_id: 'c1', document_id: 'd1', filename: 'ethics.pdf', page: 8, excerpt: 'A is true here. B holds too.' }
const msg = (id: string, role: 'user' | 'assistant', content: string, citations: Citation[] = []): ChatMessage =>
  ({ id, role, content, refused: false, created_at: '', search_question: null, citations })
const conv = (messages: ChatMessage[]): ConversationDetail => ({ id: 'c1', title: 'T', created_at: '', instructions: '', messages })

function show(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

beforeEach(() => { vi.resetAllMocks() })

describe('ReaderSource (the Source tab)', () => {
  it('lists every claim that cites the source, with the marked card and Back to chat', async () => {
    api.getConversation.mockResolvedValue(conv([msg('u1', 'user', 'Q'), msg('a1', 'assistant', 'A is true [1]. B holds [1]. A is really true [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} highlightMissing={false} />)
    const claims = await screen.findAllByRole('listitem')
    expect(claims.map((c) => c.textContent)).toEqual(['A is true.', 'B holds.', 'A is really true.'])
    expect(document.querySelectorAll('mark')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Back to chat' })).toHaveAttribute('href', '/chat/c1')
    expect(screen.queryByRole('link', { name: /Open page/ })).toBeNull()          // we are on that page already
  })

  it('says when the page itself has no mark', async () => {
    api.getConversation.mockResolvedValue(conv([msg('a1', 'assistant', 'A is true [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} highlightMissing />)
    expect(await screen.findByText('Marked in the excerpt only')).toBeInTheDocument()
  })

  it('a chat that is gone or not yours shows the fallback, no crash (Review Focus 5)', async () => {
    api.getConversation.mockRejectedValue(new ApiError('not_found', 404, 'gone'))
    show(<ReaderSource conversationId="gone" answerId="a1" n={1} highlightMissing={false} />)
    expect(await screen.findByText('Open a source from a chat to see it here.')).toBeInTheDocument()
  })

  it('opened from the Library (no chat): the fallback', () => {
    show(<ReaderSource highlightMissing={false} />)
    expect(screen.getByText('Open a source from a chat to see it here.')).toBeInTheDocument()
  })
})

describe('ReaderChat (the Chat tab)', () => {
  it('continues the conversation: a question is sent to that chat', async () => {
    api.getConversation.mockResolvedValue(conv([msg('u1', 'user', 'Q'), msg('a1', 'assistant', 'A is true [1].', [cite])]))
    api.sendMessage.mockResolvedValue({ message_id: 'a2', answer: 'More [1].', refused: false, search_question: 'Q2', citations: [cite] })
    const user = userEvent.setup()
    show(<ReaderChat conversationId="c1" onOpenCitation={vi.fn()} onStarted={vi.fn()} />)
    await user.type(await screen.findByRole('textbox', { name: 'Ask about your documents' }), 'And B?{Enter}')
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('c1', 'And B?'))
  })

  it('clicking a citation opens its page in the Reader', async () => {
    api.getConversation.mockResolvedValue(conv([msg('u1', 'user', 'Q'), msg('a1', 'assistant', 'A is true [1].', [cite])]))
    const onOpenCitation = vi.fn()
    show(<ReaderChat conversationId="c1" onOpenCitation={onOpenCitation} onStarted={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /Source 1/ }))
    expect(onOpenCitation).toHaveBeenCalledWith(cite, 'a1', 1)
  })

  it('opened from the Library (no chat): the first question starts a new chat', async () => {
    api.createConversation.mockResolvedValue({ id: 'new1', title: null, created_at: '' })
    api.sendMessage.mockResolvedValue({ message_id: 'a1', answer: 'Yes [1].', refused: false, search_question: 'Q', citations: [cite] })
    api.getConversation.mockResolvedValue(conv([]))
    const onStarted = vi.fn()
    const user = userEvent.setup()
    show(<ReaderChat onOpenCitation={vi.fn()} onStarted={onStarted} />)
    await user.type(screen.getByRole('textbox', { name: 'Ask about your documents' }), 'What is this?{Enter}')
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('new1'))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('new1', 'What is this?'))
  })
})
