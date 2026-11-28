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
  it('names the question and lists every claim that cites the source, with the marked card', async () => {
    api.getConversation.mockResolvedValue(conv([msg('u1', 'user', 'Q'), msg('a1', 'assistant', 'A is true [1]. B holds [1]. A is really true [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} missingOnPage={null} />)
    const claims = await screen.findAllByRole('listitem')
    expect(claims.map((c) => c.textContent)).toEqual(['A is true.', 'B holds.', 'A is really true.'])
    expect(document.querySelectorAll('mark')).toHaveLength(2)
    expect(screen.getByText('For: Q')).toBeInTheDocument()                          // which question this evidence answers
    expect(screen.queryByRole('link', { name: 'Back to chat' })).toBeNull()          // the toolbar has it already
    expect(screen.queryByRole('link', { name: /Open page/ })).toBeNull()          // we are on that page already
  })

  it('says when the page itself has no mark', async () => {
    api.getConversation.mockResolvedValue(conv([msg('a1', 'assistant', 'A is true [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} missingOnPage="all" />)
    expect(await screen.findByText('Not found on this page: marked in the excerpt only.')).toBeInTheDocument()
  })

  it('says when only some sentences are marked on the page (final review)', async () => {
    api.getConversation.mockResolvedValue(conv([msg('a1', 'assistant', 'A is true [1]. B holds [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} missingOnPage="some" />)
    expect(await screen.findByText('Not all of these are marked on the page: the excerpt below has every mark.')).toBeInTheDocument()
    expect(screen.queryByText('Not found on this page: marked in the excerpt only.')).toBeNull()
  })

  it('explains the mark when the card has one', async () => {
    api.getConversation.mockResolvedValue(conv([msg('a1', 'assistant', 'A is true [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} missingOnPage={null} />)
    expect(await screen.findByText('Green bar and underline: the sentence Ery used for [1].')).toBeInTheDocument()
  })

  it('no mark, no explanation', async () => {
    api.getConversation.mockResolvedValue(conv([msg('a1', 'assistant', 'Volcanoes erupt [1].', [cite])]))
    show(<ReaderSource conversationId="c1" answerId="a1" n={1} missingOnPage={null} />)
    await screen.findByText('From your answer')
    expect(document.querySelectorAll('mark')).toHaveLength(0)
    expect(screen.queryByText(/Green bar and underline/)).toBeNull()
  })

  it('a chat that is gone or not yours shows the fallback, no crash (Review Focus 5)', async () => {
    api.getConversation.mockRejectedValue(new ApiError('not_found', 404, 'gone'))
    show(<ReaderSource conversationId="gone" answerId="a1" n={1} missingOnPage={null} />)
    expect(await screen.findByText('Open a source from a chat to see it here.')).toBeInTheDocument()
  })

  it('opened from the Library (no chat): the fallback', () => {
    show(<ReaderSource missingOnPage={null} />)
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

  it('a new message scrolls into view (found on the real stack: the answer stayed below the question box)', async () => {
    api.getConversation.mockResolvedValue(conv([msg('u1', 'user', 'Q'), msg('a1', 'assistant', 'A is true [1].', [cite])]))
    api.sendMessage.mockReturnValue(new Promise(() => {}))          // still waiting for the model
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      const user = userEvent.setup()
      show(<ReaderChat conversationId="c1" onOpenCitation={vi.fn()} onStarted={vi.fn()} />)
      await user.type(await screen.findByRole('textbox', { name: 'Ask about your documents' }), 'And B?{Enter}')
      await waitFor(() => expect(scroll).toHaveBeenCalled())
      expect((scroll.mock.contexts.at(-1) as HTMLElement).dataset.end).toBe('chat')
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it("a card for the page already open says so instead of offering to open it again", async () => {
    api.getConversation.mockResolvedValue(conv([msg('u1', 'user', 'Q'), msg('a1', 'assistant', 'A is true [1].', [cite])]))
    show(<ReaderChat conversationId="c1" onOpenCitation={vi.fn()} onStarted={vi.fn()} here={{ documentId: 'd1', page: 8 }} />)
    expect(await screen.findByText('You are on this page')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open page/ })).toBeNull()
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

  it('a chat that is gone or not yours: the first question starts a new chat (Review Focus 5, final review)', async () => {
    api.getConversation.mockImplementation((id: string) =>
      id === 'gone' ? Promise.reject(new ApiError('not_found', 404, 'gone')) : Promise.resolve(conv([])))
    api.createConversation.mockResolvedValue({ id: 'new1', title: null, created_at: '' })
    api.sendMessage.mockResolvedValue({ message_id: 'a1', answer: 'Yes [1].', refused: false, search_question: 'Q', citations: [cite] })
    const onStarted = vi.fn()
    const user = userEvent.setup()
    show(<ReaderChat conversationId="gone" onOpenCitation={vi.fn()} onStarted={onStarted} />)
    await waitFor(() => expect(api.getConversation).toHaveBeenCalledWith('gone'))
    await user.type(screen.getByRole('textbox', { name: 'Ask about your documents' }), 'What is this?{Enter}')
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('new1'))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('new1', 'What is this?'))
    expect(api.sendMessage).not.toHaveBeenCalledWith('gone', expect.anything())
  })
})
