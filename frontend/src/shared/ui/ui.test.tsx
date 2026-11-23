import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Trash2 } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { ErrorState } from './ErrorState'
import { IconButton } from './IconButton'
import { InlineConfirm } from './InlineConfirm'
import { TextField } from './TextField'

describe('UI kit', () => {
  it('icon button exposes its label to screen readers', () => {
    render(<IconButton label="Delete document" icon={Trash2} />)
    expect(screen.getByRole('button', { name: 'Delete document' })).toBeInTheDocument()
  })

  it('text field links its hint and error to the input', () => {
    render(<TextField label="Password" hint="At least 6 characters" error="Too short" />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAccessibleDescription(/At least 6 characters/)
    expect(input).toHaveAccessibleDescription(/Too short/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('busy button is disabled and aria-busy', () => {
    render(<Button variant="primary" busy>Ask</Button>)
    const button = screen.getByRole('button', { name: 'Ask' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('inline confirm calls onConfirm, and Escape calls onCancel', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(
      <InlineConfirm question="Delete notes.pdf?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()   // safe choice focused first
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    unmount()

    render(<InlineConfirm question="Delete notes.pdf?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('error state is announced and retry calls back', async () => {
    const onRetry = vi.fn()
    render(<ErrorState message="Can't reach the server" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
