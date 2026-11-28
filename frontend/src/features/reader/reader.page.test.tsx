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
  PdfView: (p: { url: string; page: number; onExpired(): void; onBroken(): void; onFailed(): void; onPageChange(page: number, total: number, jumped: boolean): void;
    onMarks?(found: { index: number; page: number }[], total: number): void; onMarksShown?(count: number): void }) => (
    <div>
      <p>PDF {p.url} page {p.page}</p>
      <button onClick={p.onExpired}>expire</button>
      <button onClick={p.onBroken}>break</button>
      <button onClick={p.onFailed}>fail</button>
      <button onClick={() => p.onPageChange(112, 340, true)}>turn</button>
      <button onClick={() => p.onPageChange(113, 340, false)}>scroll</button>
      <button onClick={() => p.onMarksShown?.(2)}>marked</button>
      <button onClick={() => p.onMarks?.([{ index: 0, page: 112 }], 1)}>all found</button>
      <button onClick={() => p.onMarks?.([], 2)}>miss</button>
      <button onClick={() => p.onMarks?.([{ index: 0, page: 112 }], 2)}>miss one</button>
    </div>
  ),
}))

import { ReaderPage, type ReaderBack } from './ReaderPage'

const link = (url = 'https://x.supabase.co/signed/1') => ({ url, expires_in: 600 })

function page(back: ReaderBack = { to: '/library', label: 'Back to Library' }, panels: Partial<Parameters<typeof ReaderPage>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (props: Partial<Parameters<typeof ReaderPage>[0]>) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReaderPage documentId="d1" filename="notes.pdf" page={112} highlights={[]} back={back} {...panels} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const { rerender } = render(ui({}))
  return { rerender: (props: Partial<Parameters<typeof ReaderPage>[0]>) => rerender(ui(props)) }
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

  it('a Reader address with an id that is not a document id shows the gone state, not a retry loop (final review)', async () => {
    api.getFileUrl.mockRejectedValue(new ApiError('invalid', 422, 'Unprocessable'))
    page()
    expect(await screen.findByText('This document is no longer in your Library.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
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

  it('a download that fails mid-way (network dropped) offers Try again, which opens the PDF again (final review)', async () => {
    api.getFileUrl.mockResolvedValueOnce(link('https://x/1')).mockResolvedValue(link('https://x/2'))
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'fail' }))
    expect(await screen.findByText("This PDF couldn't be loaded.")).toBeInTheDocument()
    expect(screen.queryByText("This PDF can't be shown here.")).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('PDF https://x/2 page 112')).toBeInTheDocument()
  })

  it('a damaged PDF does not make the next document look damaged too (final review)', async () => {
    api.getFileUrl.mockImplementation((id: string) => Promise.resolve(link(`https://x/${id}`)))
    const { rerender } = page()
    await userEvent.click(await screen.findByRole('button', { name: 'break' }))
    expect(await screen.findByText("This PDF can't be shown here.")).toBeInTheDocument()
    rerender({ documentId: 'd2', page: 3 })                       // a citation in the Chat tab opens another PDF
    expect(await screen.findByText('PDF https://x/d2 page 3')).toBeInTheDocument()
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
    source: ({ missingOnPage }: { missingOnPage: 'all' | 'some' | null }) => <p>{missingOnPage ? `SOURCE (missing ${missingOnPage})` : 'SOURCE'}</p>,
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
    expect(screen.getByText('SOURCE (missing all)')).toBeInTheDocument()
  })

  it('only some sentences missing on the page: the Source panel is told "some", not "all" (final review)', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    await userEvent.click(await screen.findByRole('button', { name: 'miss one' }))
    expect(screen.getByText('SOURCE (missing some)')).toBeInTheDocument()
  })

  it('every sentence found: the Source panel is told nothing is missing', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    await userEvent.click(await screen.findByRole('button', { name: 'all found' }))
    expect(screen.getByText('SOURCE')).toBeInTheDocument()
  })
})

describe('keyboard and screen readers (critique P2)', () => {
  const panels = { source: () => <p>SOURCE <a href="#x">link in source</a></p>, chat: <p>CHAT</p>, defaultTab: 'source' as const }

  it('announces jumps and how many sentences are marked, but not every page passed while scrolling', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'turn' }))
    await userEvent.click(screen.getByRole('button', { name: 'marked' }))
    const live = screen.getByRole('status')
    expect(live).toHaveTextContent('Page 112 of 340. 2 sentences marked.')
    await userEvent.click(screen.getByRole('button', { name: 'scroll' }))
    expect(live).toHaveTextContent('Page 112 of 340. 2 sentences marked.')       // scrolling is not announced
    expect(screen.getByText('113 / 340')).toBeInTheDocument()                    // the visible counter still follows
  })

  it('arrow keys move focus to the other tab, not only the selection', async () => {
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    const source = await screen.findByRole('tab', { name: 'Source' })
    source.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
  })

  it('the slide-over keeps keyboard focus inside while it is open', async () => {
    layout.value = 'medium'
    api.getFileUrl.mockResolvedValue(link())
    page(undefined, panels)
    await userEvent.click(await screen.findByRole('button', { name: 'Source' }))
    const dialog = screen.getByRole('dialog', { name: 'Source and chat' })
    for (let i = 0; i < 6; i++) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await userEvent.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})

