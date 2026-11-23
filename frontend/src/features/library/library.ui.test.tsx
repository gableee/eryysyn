import { render as rtlRender, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DocumentRow } from './DocumentRow'
import { EmptyLibrary } from './EmptyLibrary'
import { UploadZone } from './UploadZone'
import { MAX_UPLOAD_BYTES, validateFile } from './validateFile'
import type { LibraryDocument } from './types'

// rows link to the Reader (Task 4), so every render needs a router
const render = (ui: ReactNode) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const file = (name: string, type: string, bytes = 10) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}
const doc = (status: LibraryDocument['status'], filename = 'Vital Signs, ch. 12.pdf'): LibraryDocument =>
  ({ id: 'd1', filename, status, created_at: '2026-11-22T10:00:00Z' })

describe('validateFile', () => {
  it.each([
    ['notes.pdf', 'application/pdf', 1000, null],
    ['NOTES.PDF', '', 1000, null],                                   // some systems send no type
    ['photo.png', 'image/png', 1000, 'Only PDF files for now.'],
    ['big.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1, 'This file is over 20 MB.'],
  ])('%s (%s, %i bytes) -> %s', (name, type, bytes, expected) => {
    expect(validateFile(file(name, type, bytes))).toBe(expected)
  })

  it('the limit is the backend one: 20 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024)
  })
})

describe('DocumentRow', () => {
  it('ready shows an icon and text, not colour only', () => {
    render(<DocumentRow doc={doc('indexed')} />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('failed offers Try again', async () => {
    const onRetry = vi.fn()
    render(<DocumentRow doc={doc('failed')} onRetry={onRetry} />)
    expect(screen.getByText("Couldn't read it")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('delete asks before deleting', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<DocumentRow doc={doc('indexed')} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Vital Signs, ch. 12.pdf' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Delete Vital Signs, ch. 12.pdf? Answers that cite it will show "Source removed".')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('cancel keeps the document', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<DocumentRow doc={doc('indexed')} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Vital Signs, ch. 12.pdf' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('an uploading row shows the long-wait text and no actions', () => {
    render(<DocumentRow doc={{ filename: 'notes.pdf', status: 'uploading' }} />)
    expect(screen.getByText('Uploading and reading… this can take a minute')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('a very long file name is shown in full', () => {
    const long = 'Pharmacology lecture 7 – antihypertensives, beta blockers, ACE inhibitors and diuretics (final).pdf'
    render(<DocumentRow doc={doc('indexed', long)} />)
    expect(screen.getByText(long)).toBeInTheDocument()
  })
})

describe('UploadZone', () => {
  it('a chosen file is passed on', async () => {
    const onFile = vi.fn()
    render(<UploadZone onFile={onFile} disabled={false} />)
    await userEvent.upload(screen.getByLabelText('Choose a file'), file('notes.pdf', 'application/pdf'))
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'notes.pdf' }))
  })

  it('shows the limits and an error in words', () => {
    render(<UploadZone onFile={vi.fn()} disabled={false} error="Only PDF files for now." />)
    expect(screen.getByText('PDF · up to 20 MB')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Only PDF files for now.')
  })

  it('cannot be used while disabled', () => {
    render(<UploadZone onFile={vi.fn()} disabled />)
    expect(screen.getByLabelText('Choose a file')).toBeDisabled()
  })
})

describe('EmptyLibrary', () => {
  it('teaches the first step', () => {
    render(<EmptyLibrary upload={<p>zone</p>} />)
    expect(screen.getByText('After uploading, ask questions in Chat.')).toBeInTheDocument()
    expect(screen.getByText('zone')).toBeInTheDocument()
  })
})

describe('opening a document (Task 4)', () => {
  it("a stored document's name links to the Reader at page 1", () => {
    render(<DocumentRow doc={doc('indexed', 'notes.pdf')} onDelete={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'notes.pdf' })).toHaveAttribute('href', '/documents/d1')
  })

  it('a failed document can still be opened (a scanned PDF is still readable as pages)', () => {
    render(<DocumentRow doc={doc('failed', 'scan.pdf')} onRetry={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'scan.pdf' })).toBeInTheDocument()
  })

  it('a file still uploading has no link (nothing stored yet)', () => {
    render(<DocumentRow doc={{ filename: 'new.pdf', status: 'uploading' }} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('new.pdf')).toBeInTheDocument()
  })
})
