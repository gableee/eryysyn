import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/http'
import type { LibraryDocument } from './types'

const ws = vi.hoisted(() => ({ id: 'w1' as string | undefined }))
vi.mock('../../shared/workspace', () => ({ useWorkspaceId: () => ({ workspaceId: ws.id, isLoading: !ws.id, error: null }) }))
const api = vi.hoisted(() => ({
  listDocuments: vi.fn(), uploadDocument: vi.fn(), retryDocument: vi.fn(), deleteDocument: vi.fn(),
}))
vi.mock('./api', () => api)

import { LibraryPage } from './LibraryPage'

const doc = (id: string, filename: string, status: LibraryDocument['status']): LibraryDocument =>
  ({ id, filename, status, created_at: '2026-11-22T10:00:00Z' })
const pdf = (name = 'notes.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })

/** A promise the test resolves when it wants: lets us look at the screen while a request is running. */
function later<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><LibraryPage /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => { vi.resetAllMocks(); ws.id = 'w1' })

describe('LibraryPage', () => {
  it('an empty list shows the first-visit state', async () => {
    api.listDocuments.mockResolvedValue([])
    page()
    expect(await screen.findByText('After uploading, ask questions in Chat.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument()
  })

  it('choosing a pdf shows the uploading row, then the ready row', async () => {
    const upload = later<{ id: string; filename: string; status: string }>()
    api.listDocuments.mockResolvedValueOnce([]).mockResolvedValue([doc('d1', 'notes.pdf', 'indexed')])
    api.uploadDocument.mockReturnValue(upload.promise)
    const user = userEvent.setup()
    page()
    await user.upload(await screen.findByLabelText('Choose a file'), pdf())
    expect(await screen.findByText('Uploading and reading… this can take a minute')).toBeInTheDocument()
    expect(api.uploadDocument).toHaveBeenCalledWith('w1', expect.objectContaining({ name: 'notes.pdf' }))
    upload.resolve({ id: 'd1', filename: 'notes.pdf', status: 'indexed' })
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    // the uploading row fades out (exit animation), then is gone
    await waitFor(() => expect(screen.queryByText(/Uploading and reading/)).not.toBeInTheDocument())
  })

  it('the upload zone is disabled while a file uploads', async () => {
    api.listDocuments.mockResolvedValue([doc('d0', 'old.pdf', 'indexed')])
    api.uploadDocument.mockReturnValue(later().promise)            // never finishes in this test
    const user = userEvent.setup()
    page()
    const input = await screen.findByLabelText('Upload PDF')
    await user.upload(input, pdf())
    await waitFor(() => expect(screen.getByLabelText('Upload PDF')).toBeDisabled())
  })

  it('a file that is not a pdf is refused before anything is sent', async () => {
    api.listDocuments.mockResolvedValue([])
    const user = userEvent.setup({ applyAccept: false })
    page()
    await user.upload(await screen.findByLabelText('Choose a file'), new File(['x'], 'photo.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PDF files for now.')
    expect(api.uploadDocument).not.toHaveBeenCalled()
  })

  it.each([
    [413, 'too_large', 'This file is over 20 MB.'],
    [415, 'unsupported', 'Only PDF files for now.'],
  ] as const)('a %i from the server shows "%s"', async (status, kind, message) => {
    api.listDocuments.mockResolvedValue([])
    api.uploadDocument.mockRejectedValue(new ApiError(kind, status, 'x'))
    const user = userEvent.setup()
    page()
    await user.upload(await screen.findByLabelText('Choose a file'), pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('Try again calls retry and shows the new status', async () => {
    const retry = later<{ id: string; status: string }>()
    api.listDocuments.mockResolvedValueOnce([doc('d1', 'scan.pdf', 'failed')]).mockResolvedValue([doc('d1', 'scan.pdf', 'indexed')])
    api.retryDocument.mockReturnValue(retry.promise)
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(api.retryDocument).toHaveBeenCalledWith('d1')
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('aria-busy', 'true')
    retry.resolve({ id: 'd1', status: 'indexed' })
    expect(await screen.findByText('Ready')).toBeInTheDocument()
  })

  it('deleting removes the row after confirm', async () => {
    api.listDocuments.mockResolvedValueOnce([doc('d1', 'notes.pdf', 'indexed')]).mockResolvedValue([])
    api.deleteDocument.mockResolvedValue(null)
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: 'Delete notes.pdf' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(api.deleteDocument).toHaveBeenCalledWith('d1')
    await waitFor(() => expect(screen.queryByText('notes.pdf')).not.toBeInTheDocument())
  })

  it('a list error shows an error with Try again, which loads again', async () => {
    api.listDocuments.mockRejectedValueOnce(new ApiError('network', null, 'x')).mockResolvedValue([doc('d1', 'notes.pdf', 'indexed')])
    const user = userEvent.setup()
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('notes.pdf')).toBeInTheDocument()
  })
})

describe('code review fixes', () => {
  it('a document stuck as "uploaded" (not uploading in this tab) can be tried again', async () => {
    api.listDocuments.mockResolvedValue([doc('d1', 'stuck.pdf', 'uploaded')])
    api.retryDocument.mockResolvedValue({ id: 'd1', status: 'indexed' })
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(api.retryDocument).toHaveBeenCalledWith('d1')
  })

  it('a file being uploaded is listed once, even when the server already lists it', async () => {
    api.listDocuments.mockResolvedValueOnce([doc('d0', 'old.pdf', 'indexed')])
      .mockResolvedValue([doc('d1', 'notes.pdf', 'uploaded')])        // a refetch during the upload
    api.uploadDocument.mockReturnValue(later().promise)
    api.deleteDocument.mockResolvedValue(null)
    const user = userEvent.setup()
    page()
    await user.upload(await screen.findByLabelText('Upload PDF'), pdf('notes.pdf'))
    await user.click(screen.getByRole('button', { name: 'Delete old.pdf' }))     // triggers a refetch
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('notes.pdf')).toHaveLength(1)
  })

  it('uploading is not possible until the workspace is known', async () => {
    ws.id = undefined
    api.listDocuments.mockResolvedValue([])
    page()
    expect(await screen.findByLabelText('Choose a file')).toBeDisabled()
  })
})

describe('upload size by state', () => {
  it('an empty library shows the big drop zone', async () => {
    api.listDocuments.mockResolvedValue([])
    page()
    expect(await screen.findByText('Drop a PDF here, or')).toBeInTheDocument()
  })

  it('with documents, uploading is a compact button and the list comes first', async () => {
    api.listDocuments.mockResolvedValue([doc('d1', 'notes.pdf', 'indexed')])
    page()
    expect(await screen.findByLabelText('Upload PDF')).toBeInTheDocument()
    expect(screen.queryByText('Drop a PDF here, or')).not.toBeInTheDocument()
  })

  it('with documents, a file dropped anywhere on the page is uploaded', async () => {
    api.listDocuments.mockResolvedValue([doc('d1', 'notes.pdf', 'indexed')])
    api.uploadDocument.mockReturnValue(later().promise)
    page()
    const list = await screen.findByRole('list', { name: 'Your documents' })
    const dropped = pdf('dropped.pdf')
    fireEvent.drop(list, { dataTransfer: { files: [dropped], types: ['Files'] } })
    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledWith('w1', dropped))
  })
})

describe('critique fixes (library)', () => {
  it('nothing is sent while the workspace is unknown, even if a file reaches the input', async () => {
    ws.id = undefined
    api.listDocuments.mockResolvedValue([])
    page()
    const input = await screen.findByLabelText('Choose a file')
    fireEvent.change(input, { target: { files: [pdf('early.pdf')] } })      // bypasses "disabled", like a script
    await new Promise((r) => setTimeout(r, 50))
    expect(api.uploadDocument).not.toHaveBeenCalled()
  })
})
