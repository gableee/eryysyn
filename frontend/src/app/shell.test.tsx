import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionState = vi.hoisted(() => ({ value: { session: null as unknown, loading: false } }))
vi.mock('../features/auth/useSession', () => ({ useSession: () => sessionState.value }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock('../shared/supabase', () => ({ supabase: { auth: { signOut } } }))

import { applyMode, useTheme } from '../shared/theme'
import { createRoutes } from './routes'

const signedIn = { session: { user: { id: 'u1', email: 'a@b.co' } }, loading: false }
const signedOut = { session: null, loading: false }

function open(path: string, dev = false) {
  const router = createMemoryRouter(createRoutes(dev), { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-mode') })
afterEach(() => { vi.restoreAllMocks() })

describe('routes', () => {
  it('a signed-out user visiting /library is sent to /login', async () => {
    sessionState.value = signedOut
    const router = open('/library')
    expect(await screen.findByRole('heading', { name: 'Log in to Eryysyn' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('a signed-in user visiting /login is sent into the app', async () => {
    sessionState.value = signedIn
    const router = open('/login')
    await screen.findByRole('navigation', { name: 'Main' })
    expect(router.state.location.pathname).not.toBe('/login')   // in the app ("/" then picks Chat or Library)
  })

  it('/dev/states is not routed in production', async () => {
    sessionState.value = signedIn
    const router = open('/dev/states', false)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(router.state.location.pathname).not.toBe('/dev/states')
  })

  it('/dev/states exists in development, without logging in (sample data only)', async () => {
    sessionState.value = signedOut
    open('/dev/states', true)
    expect(await screen.findByRole('heading', { name: 'Component states' })).toBeInTheDocument()
  })
})

describe('login page', () => {
  it.each(['/login', '/register'])('%s shows a real example answer beside the form, which keyboards skip', async (path) => {
    sessionState.value = signedOut
    open(path)
    const example = await screen.findByRole('figure', { name: 'Example of an Eryysyn answer' })
    expect(example).toHaveAttribute('inert')                       // visible, not focusable, not a form part
    expect(within(example).getAllByText(/systolic reading below 120 mmHg/)).toHaveLength(2)   // the answer and its excerpt
    expect(within(example).getByText('Check the cited page before relying on an answer.')).toBeInTheDocument()
  })
})

describe('after login', () => {
  function openWithFrom(from: string) {
    const router = createMemoryRouter(createRoutes(false), { initialEntries: [{ pathname: '/login', state: { from } }] })
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
    return router
  }

  it('returns to the page the user wanted before logging in', async () => {
    sessionState.value = signedIn
    const router = openWithFrom('/library')
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
  })

  it.each(['//evil.example/x', 'https://evil.example', 'javascript:alert(1)'])('ignores an unsafe return address %s', async (from) => {
    sessionState.value = signedIn
    const router = openWithFrom(from)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(router.state.location.pathname.startsWith('//')).toBe(false)
    expect(router.state.location.pathname).not.toContain('evil')
  })
})

describe('shell', () => {
  it('navigation shows only the features that work, once each', async () => {
    sessionState.value = signedIn
    open('/library')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent?.trim())).toEqual(['New chat', 'Library'])
    for (const hidden of ['Notes', 'Bookmarks', 'Study', 'Voice', 'Paper', 'Slate', 'later']) {
      expect(screen.queryByText(new RegExp(hidden, 'i'))).not.toBeInTheDocument()
    }
  })

  it('phone tabs keep Chat and Library', async () => {
    sessionState.value = signedIn
    open('/library')
    const tabs = await screen.findByRole('navigation', { name: 'Tabs' })
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent?.trim())).toEqual(['Chat', 'Library'])
  })

  it('log out lives in the account menu, not one tap away', async () => {
    sessionState.value = signedIn
    const user = userEvent.setup()
    open('/library')
    await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Account' })[0])
    expect(within(screen.getByRole('menu')).getByText('a@b.co')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('the account menu closes with Escape', async () => {
    sessionState.value = signedIn
    const user = userEvent.setup()
    open('/library')
    await user.click((await screen.findAllByRole('button', { name: 'Account' }))[0])
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('the current page is marked for screen readers', async () => {
    sessionState.value = signedIn
    open('/library')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: /Library/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('theme', () => {
  function Toggle() {
    const { mode, toggle } = useTheme()
    return <button onClick={toggle}>{mode}</button>
  }

  it('toggle switches data-mode and remembers it', async () => {
    applyMode('light')
    render(<Toggle />)
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(localStorage.getItem('eryysyn.mode')).toBe('dark')
  })

  it('still works when localStorage throws (private mode, blocked storage)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    applyMode('light')
    render(<Toggle />)
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.dataset.mode).toBe('dark')
  })
})
