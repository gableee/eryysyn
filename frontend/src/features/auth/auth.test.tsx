import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- a fake Supabase auth: every test sets what it returns ------------------------------------
type AuthCallback = (event: string, session: unknown) => void
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  listener: null as null | AuthCallback,
}))
vi.mock('../../shared/supabase', () => ({ supabase: { auth } }))

import { http, setUnauthorizedHandler } from '../../shared/http'
import { CheckInboxPage } from './CheckInboxPage'
import { GoogleButton } from './GoogleButton'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { SessionProvider } from './SessionProvider'
import { useSession } from './useSession'

const session = (id: string) => ({ access_token: 't', user: { id } })

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockImplementation((cb: AuthCallback) => {
    auth.listener = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  auth.signOut.mockImplementation(async () => { auth.listener?.('SIGNED_OUT', null); return { error: null } })
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); setUnauthorizedHandler(() => {}) })

function at(path: string, ui: ReactNode, client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/library" element={<h1>Library page</h1>} />
            <Route path="/" element={<h1>Home page</h1>} />
            <Route path="/login" element={<h1>Login page</h1>} />
            <Route path="/check-inbox" element={<CheckInboxPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
}

describe('Login', () => {
  it('shows "Wrong email or password" on invalid credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials', status: 400 } })
    const user = userEvent.setup()
    at('/login-form', <LoginPage />)
    await fill(user, 'a@b.co', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument()
  })

  it('shows "Can\'t reach the server" when the request fails', async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    at('/login-form', <LoginPage />)
    await fill(user, 'a@b.co', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
  })

  it('the password can be shown and hidden', async () => {
    const user = userEvent.setup()
    at('/login-form', <LoginPage />)
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
  })
})

describe('Register', () => {
  it('asks for at least 8 characters before sending anything', async () => {
    const user = userEvent.setup()
    at('/register', <RegisterPage />)
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/At least 8 characters/)
    await fill(user, 'a@b.co', 'short12')                       // 7 characters
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('with a returned session goes to /library', async () => {
    auth.signUp.mockResolvedValue({ data: { session: session('u1'), user: { id: 'u1', identities: [{}] } }, error: null })
    const user = userEvent.setup()
    at('/register', <RegisterPage />)
    await fill(user, 'a@b.co', 'secret12')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Library page' })).toBeInTheDocument()
  })

  it('without a session goes to /check-inbox and shows the email', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u1', identities: [{}] } }, error: null })
    const user = userEvent.setup()
    at('/register', <RegisterPage />)
    await fill(user, 'new@b.co', 'secret12')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('We sent a link to new@b.co. Open it, then log in.')).toBeInTheDocument()
  })

  it.each([
    ['confirm off: an error', { data: {}, error: { message: 'User already registered', status: 422 } }],
    ['confirm on: a user with no identities', { data: { session: null, user: { id: 'x', identities: [] } }, error: null }],
  ])('with an existing email (%s) links to login', async (_case, reply) => {
    auth.signUp.mockResolvedValue(reply)
    const user = userEvent.setup()
    at('/register', <RegisterPage />)
    await fill(user, 'old@b.co', 'secret12')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    const message = await screen.findByRole('alert')
    expect(message).toHaveTextContent('This email already has an account.')
    expect(within(message).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})

describe('Google', () => {
  it('only renders when VITE_AUTH_GOOGLE is "true"', () => {
    vi.stubEnv('VITE_AUTH_GOOGLE', 'false')
    const { container } = render(<GoogleButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('starts the Google sign-in back to this site', async () => {
    vi.stubEnv('VITE_AUTH_GOOGLE', 'true')
    auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    render(<GoogleButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google', options: { redirectTo: window.location.origin },
    })
  })
})

describe('Session', () => {
  it('signing out by a 401 clears cached data', async () => {
    auth.getSession.mockResolvedValue({ data: { session: session('u1') } })
    const client = new QueryClient()
    client.setQueryData(['documents', 'w1'], [{ id: 'd1', filename: 'private.pdf' }])
    function Probe() { const { session: s } = useSession(); return <p>{s ? 'signed in' : 'signed out'}</p> }
    at('/probe', <Probe />, client)
    expect(await screen.findByText('signed in')).toBeInTheDocument()

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await http('/workspaces').catch(() => {})                  // the API says: token no longer valid

    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument())
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['documents', 'w1'])).toBeUndefined()   // nothing left for the next person
  })

  it('a different user signing in also clears the previous user\'s data', async () => {
    auth.getSession.mockResolvedValue({ data: { session: session('u1') } })
    const client = new QueryClient()
    at('/probe', <p>x</p>, client)
    await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled())
    client.setQueryData(['documents', 'w1'], [{ id: 'd1' }])
    auth.listener?.('SIGNED_IN', session('u2'))
    await waitFor(() => expect(client.getQueryData(['documents', 'w1'])).toBeUndefined())
  })
})
