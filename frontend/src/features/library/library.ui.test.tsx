import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DocumentRow } from './DocumentRow'
import { EmptyLibrary } from './EmptyLibrary'
import { UploadZone } from './UploadZone'
import { MAX_UPLOAD_BYTES, validateFile } from './validateFile'
import type { LibraryDocument } from './types'

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
    expect(screen.getByText('Delete Vital Signs, ch. 12.pdf?')).toBeInTheDocument()
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
