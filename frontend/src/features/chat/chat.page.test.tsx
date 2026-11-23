import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http'
import type { ChatMessage, Citation, ConversationDetail, SendResult } from './types'

const ws = vi.hoisted(() => ({ id: 'w1' as string | undefined }))
vi.mock('../../shared/workspace', () => ({ useWorkspaceId: () => ({ workspaceId: ws.id, isLoading: !ws.id, error: null }) }))
const api = vi.hoisted(() => ({
  listConversations: vi.fn(), getConversation: vi.fn(), createConversation: vi.fn(), sendMessage: vi.fn(), listDocuments: vi.fn(),
}))
vi.mock('./api', () => api)

import { ChatList } from './ChatList'
import { ChatPage } from './ChatPage'
import { RootRedirect } from './RootRedirect'

const cite: Citation = { n: 1, chunk_id: 'c1', document_id: 'd1', filename: 'ethics.pdf', page: 8, excerpt: 'Strict liability excerpt.' }
const reply = (answer = 'It applies to manufacturers [1].', extra: Partial<SendResult> = {}): SendResult =>
  ({ message_id: 'a1', answer, refused: false, search_question: 'Q?', citations: [cite], ...extra })
const userMsg = (id: string, content: string, search: string | null = null): ChatMessage =>
  ({ id, role: 'user', content, refused: false, created_at: '', search_question: search, citations: [] })
const answerMsg = (id: string, content: string, citations = [cite]): ChatMessage =>
  ({ id, role: 'assistant', content, refused: false, created_at: '', search_question: null, citations })
const conversation = (messages: ChatMessage[], id = 'c1'): ConversationDetail =>
  ({ id, title: 'Test chat', created_at: '', instructions: '', messages })

function later<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function open(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/chat/:id?', element: <ChatPage /> },
    { path: '/library', element: <h1>Library page</h1> },
    { path: '/', element: <RootRedirect /> },
    { path: '/side', element: <ChatList /> },
  ], { initialEntries: [path] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(await screen.findByRole('textbox', { name: 'Ask about your documents' }), `${text}{Enter}`)
}

/** A tiny fake backend: like the real one, a sent question and its answer are saved in the chat. */
let store: Record<string, ChatMessage[]> = {}
let n = 0
function save(id: string, question: string, r: SendResult): SendResult {
  n += 1
  store[id] = [...(store[id] ?? []), userMsg(`u${n}`, question, r.search_question), answerMsg(`a${n}`, r.answer, r.citations)]
  return r
}

beforeEach(() => {
  vi.resetAllMocks()
  ws.id = 'w1'
  store = {}
  api.listDocuments.mockResolvedValue([{ id: 'd1' }])
  api.listConversations.mockResolvedValue([])
  api.getConversation.mockImplementation(async (id: string) => conversation(store[id] ?? [], id))
  api.sendMessage.mockImplementation(async (id: string, q: string) => save(id, q, reply()))
})

describe('ChatPage', () => {
  it('a new chat with an empty library says to upload a PDF first', async () => {
    api.listDocuments.mockResolvedValue([])
    open('/chat')
    expect(await screen.findByText('Upload a PDF first')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Library/ })).toHaveAttribute('href', '/library')
  })

  it('the first question creates the chat, sends it and moves to /chat/:id', async () => {
    api.createConversation.mockResolvedValue({ id: 'c9', title: null, created_at: '' })
    const user = userEvent.setup()
    const router = open('/chat')
    expect(await screen.findByText('Ask a question about your documents.')).toBeInTheDocument()
    await ask(user, 'Who does it apply to?')
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/c9'))
    expect(api.createConversation).toHaveBeenCalledWith('w1')
    expect(api.sendMessage).toHaveBeenCalledWith('c9', 'Who does it apply to?')
    // the last word sits in a no-wrap span with its marker, so read the conversation's whole text
    await waitFor(() => expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('It applies to manufacturers'))
  })

  it('the question shows at once with the pending state and Ask disabled', async () => {
    api.sendMessage.mockReturnValue(later().promise)
    const user = userEvent.setup()
    open('/chat/c1')
    await ask(user, 'What is strict liability?')
    expect(await screen.findByText('What is strict liability?')).toBeInTheDocument()
    expect(screen.getByText('Ery is reading your documents…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })

  it('sending twice while pending makes one request', async () => {
    api.sendMessage.mockReturnValue(later().promise)
    const user = userEvent.setup()
    open('/chat/c1')
    await ask(user, 'First')
    await ask(user, 'Second')
    expect(api.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('clicking a marker activates its source card', async () => {
    store.c1 = [userMsg('u1', 'Q'), answerMsg('a1', 'Liable [1].')]
    const user = userEvent.setup()
    open('/chat/c1')
    await user.click(await screen.findByRole('button', { name: /Source 1, ethics.pdf page 8/ }))
    expect(screen.getByRole('article', { name: 'Source 1' }).className).toContain('cardActive')
  })

  it('the sources shown belong to the newest answer; a marker in an older answer switches them', async () => {
    const older = { ...cite, filename: 'old.pdf', excerpt: 'Old excerpt.' }
    const newer = { ...cite, filename: 'new.pdf', excerpt: 'New excerpt.' }
    store.c1 = [
      userMsg('u1', 'Q1'), answerMsg('a1', 'Old answer [1].', [older]),
      userMsg('u2', 'Q2'), answerMsg('a2', 'New answer [1].', [newer]),
    ]
    const user = userEvent.setup()
    open('/chat/c1')
    const panel = await screen.findByTestId('sources')
    expect(within(panel).getByText('new.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Source 1, old.pdf/ }))
    expect(within(screen.getByTestId('sources')).getByText('old.pdf')).toBeInTheDocument()
  })

  it('a 502 shows the model-unavailable error and Try again resends the same text', async () => {
    api.sendMessage
      .mockRejectedValueOnce(new ApiError('unavailable', 502, 'x'))
      .mockImplementation(async (id: string, q: string) => save(id, q, reply()))
    const user = userEvent.setup()
    open('/chat/c1')
    await ask(user, 'What is strict liability?')
    expect(await screen.findByRole('alert')).toHaveTextContent("Ery can't answer right now. The model isn't running.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenLastCalledWith('c1', 'What is strict liability?'))
    expect(api.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('if the first message fails after the chat was created, the error and Try again stay on /chat/:id', async () => {
    api.createConversation.mockResolvedValue({ id: 'c9', title: null, created_at: '' })
    api.sendMessage.mockRejectedValue(new ApiError('unavailable', 502, 'x'))
    const user = userEvent.setup()
    const router = open('/chat')
    await ask(user, 'Hello?')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/chat/c9')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a chat that no longer exists says so and offers a new chat', async () => {
    api.getConversation.mockRejectedValue(new ApiError('not_found', 404, 'x'))
    open('/chat/gone')
    expect(await screen.findByText('This chat no longer exists')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New chat' })).toHaveAttribute('href', '/chat')
  })

  it('reopening a chat shows its messages, citations and Searched for lines', async () => {
    store.c1 = [userMsg('u1', 'who does it apply to', 'Who does strict liability apply to?'), answerMsg('a1', 'Manufacturers [1].')]
    open('/chat/c1')
    expect(await screen.findByText('who does it apply to')).toBeInTheDocument()
    expect(screen.getByText('Searched for: Who does strict liability apply to?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Source 1/ })).toBeInTheDocument()
  })

  it('an answer that arrives after navigating away is shown on return', async () => {
    const send = later<SendResult>()
    api.sendMessage.mockImplementation((id: string, q: string) => send.promise.then((r) => save(id, q, r)))
    const user = userEvent.setup()
    const router = open('/chat/c1')
    await ask(user, 'Slow question')
    await router.navigate('/library')
    expect(await screen.findByRole('heading', { name: 'Library page' })).toBeInTheDocument()
    send.resolve(reply('The slow answer [1].'))
    await router.navigate('/chat/c1')
    await waitFor(() => expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('The slow answer'))
    expect(screen.getByText('Slow question')).toBeInTheDocument()
  })
})

describe('ChatList', () => {
  it('lists titles newest first, "Untitled chat" for none, and marks the current one', async () => {
    api.listConversations.mockResolvedValue([
      { id: 'c2', title: 'Newer chat', created_at: '2026-11-22' },
      { id: 'c1', title: null, created_at: '2026-11-21' },
    ])
    open('/side')
    const links = await screen.findAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Newer chat', 'Untitled chat'])
    expect(links[0]).toHaveAttribute('href', '/chat/c2')
  })
})

describe('RootRedirect', () => {
  it('goes to /library when the library is empty', async () => {
    api.listDocuments.mockResolvedValue([])
    const router = open('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
  })

  it('goes to /chat otherwise', async () => {
    const router = open('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
  })
})

describe('code review fixes', () => {
  it('a citation clicked in one chat is not shown as active in another chat', async () => {
    store.a = [userMsg('u1', 'Q'), answerMsg('a1', 'Chat A says [1].')]
    store.b = [userMsg('u2', 'Q'), answerMsg('b1', 'Chat B says [1].')]
    const user = userEvent.setup()
    const router = open('/chat/a')
    await user.click(await screen.findByRole('button', { name: /Source 1/ }))
    await router.navigate('/chat/b')
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Chat B says'))
    expect(screen.getByRole('button', { name: /Source 1/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('if creating the chat fails, the question is kept and Try again creates and sends it', async () => {
    api.createConversation.mockRejectedValueOnce(new ApiError('network', null, 'x'))
      .mockResolvedValue({ id: 'c9', title: null, created_at: '' })
    const user = userEvent.setup()
    open('/chat')
    await ask(user, 'My first question')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.getByText('My first question')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('c9', 'My first question'))
  })

  it('a failed chat creation does not follow you into another chat', async () => {
    api.createConversation.mockRejectedValue(new ApiError('network', null, 'x'))
    store.b = [userMsg('u2', 'Q'), answerMsg('b1', 'Chat B says [1].')]
    const user = userEvent.setup()
    const router = open('/chat')
    await ask(user, 'Lost?')
    await screen.findByRole('alert')
    await router.navigate('/chat/b')
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Chat B says'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Ask stays disabled until the workspace is known', async () => {
    ws.id = undefined
    open('/chat')
    const box = await screen.findByRole('textbox', { name: 'Ask about your documents' })
    await userEvent.type(box, 'Too early')
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
    expect(api.createConversation).not.toHaveBeenCalled()
  })

  it('"/" shows an error with Try again when the documents cannot be checked', async () => {
    api.listDocuments.mockRejectedValueOnce(new ApiError('network', null, 'x')).mockResolvedValue([{ id: 'd1' }])
    const router = open('/')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
  })
})

describe('chat header', () => {
  it('shows the chat title and that answers come only from your documents', async () => {
    store.c1 = [userMsg('u1', 'Q'), answerMsg('a1', 'A [1].')]
    open('/chat/c1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Test chat' })).toBeVisible()
    expect(screen.getByText('Answers come only from your documents.')).toBeInTheDocument()
  })

  it('a new chat is called "New chat"', async () => {
    open('/chat')
    expect(await screen.findByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument()
  })
})
