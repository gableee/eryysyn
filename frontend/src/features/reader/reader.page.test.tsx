import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http'

const api = vi.hoisted(() => ({ getFileUrl: vi.fn() }))
vi.mock('./api', () => api)
const layout = vi.hoisted(() => ({ value: 'wide' as 'wide' | 'medium' | 'phone' }))
vi.mock('./useReaderLayout', () => ({ useReaderLayout: () => layout.value }))
// The PDF.js view comes in Task 6; here a stand-in that lets the test trigger its callbacks.
vi.mock('./PdfView', () => ({
  PdfView: (p: { url: string; page: number; onExpired(): void; onBroken(): void; onPageChange(page: number, total: number): void; onHighlightMissing?(): void }) => (
    <div>
      <p>PDF {p.url} page {p.page}</p>
      <button onClick={p.onExpired}>expire</button>
      <button onClick={p.onBroken}>break</button>
      <button onClick={() => p.onPageChange(112, 340)}>turn</button>
      <button onClick={() => p.onHighlightMissing?.()}>miss</button>
    </div>
  ),
}))

import { ReaderPage, type ReaderBack } from './ReaderPage'

const link = (url = 'https://x.supabase.co/signed/1') => ({ url, expires_in: 600 })

function page(back: ReaderBack = { to: '/library', label: 'Back to Library' }, panels: Partial<Parameters<typeof ReaderPage>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReaderPage documentId="d1" filename="notes.pdf" page={112} highlights={[]} back={back} {...panels} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.resetAllMocks(); layout.value = 'wide' })

describe('ReaderPage', () => {
  it('shows the loading state with the file name', () => {
    api.getFileUrl.mockReturnValue(new Promise(() => {}))
    page()
    expect(screen.getByText('Opening notes.pdf…')).toBeInTheDocument()
  })

  it('opens the PDF at the requested page once the link is there', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page()
    expect(await screen.findByText('PDF https://x.supabase.co/signed/1 page 112')).toBeInTheDocument()
    expect(api.getFileUrl).toHaveBeenCalledWith('d1')
  })

  it('a 404 says the document is gone and offers Back (deleted, or not yours)', async () => {
    api.getFileUrl.mockRejectedValue(new ApiError('not_found', 404, 'Document not found'))
    page()
    expect(await screen.findByText('This document is no longer in your Library.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to Library' }).length).toBeGreaterThan(0)
  })

  it("network down shows Can't reach the server, and Try again asks again", async () => {
    api.getFileUrl.mockRejectedValueOnce(new ApiError('network', null, 'offline')).mockResolvedValue(link())
    page()
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/page 112/)).toBeInTheDocument()
  })

  it('an expired link is renewed once silently; a second expiry shows Try again', async () => {
    api.getFileUrl.mockResolvedValueOnce(link('https://x/1')).mockResolvedValueOnce(link('https://x/2')).mockResolvedValue(link('https://x/3'))
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'expire' }))
    expect(await screen.findByText('PDF https://x/2 page 112')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'expire' }))
    expect(await screen.findByText("This PDF couldn't be loaded.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('PDF https://x/3 page 112')).toBeInTheDocument()
  })

  it("a damaged PDF says it can't be shown, with Back", async () => {
    api.getFileUrl.mockResolvedValue(link())
    page({ to: '/chat/c1', label: 'Back to chat' })
    await userEvent.click(await screen.findByRole('button', { name: 'break' }))
    expect(await screen.findByText("This PDF can't be shown here.")).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to chat' })[0]).toHaveAttribute('href', '/chat/c1')
  })

  it('the toolbar shows the page counter once known, for screen readers too', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'turn' }))
    expect(screen.getByRole('status')).toHaveTextContent('Page 112 of 340')
  })
})

describe('Source and Chat panel by available space (Task 8)', () => {
  const panels = {
    source: ({ highlightMissing }: { highlightMissing: boolean }) => <p>{highlightMissing ? 'SOURCE (missing)' : 'SOURCE'}</p>,
    chat: <p>CHAT</p>,
    defaultTab: 'source' as const,
  }

  it('wide: docked panel with Source and Chat tabs; it can be collapsed and reopened', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    expect(await screen.findByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('SOURCE')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    expect(screen.getByText('CHAT')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Hide panel' }))
    expect(screen.queryByRole('tab', { name: 'Source' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true')
  })

  it('medium: closed at first; Source slides over the page, Esc closes it and focus goes back', async () => {
    layout.value = 'medium'
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    const open = await screen.findByRole('button', { name: 'Source' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Source and chat' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(open).toHaveFocus()
  })

  it('phone: just the page, no panel, no Source/Chat buttons, no sidebar toggle', async () => {
    layout.value = 'phone'
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    await screen.findByText(/page 112/)
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Source' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull()
    expect(screen.queryByRole('button', { name: /sidebar/ })).toBeNull()
  })

  it('a highlight missing on the page is passed to the Source panel', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    await userEvent.click(await screen.findByRole('button', { name: 'miss' }))
    expect(screen.getByText('SOURCE (missing)')).toBeInTheDocument()
  })
})

