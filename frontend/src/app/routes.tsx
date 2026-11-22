import { Navigate, type RouteObject } from 'react-router'
import { CheckInboxPage } from '../features/auth/CheckInboxPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AppShell } from './AppShell'
import { DevStates } from './DevStates'
import { RequireAuth, RequireGuest } from './guards'
import { LibraryPage } from '../features/library/LibraryPage'
import { Placeholder } from './Placeholder'

/** `dev` decides whether /dev/states exists; production builds never route it. */
export function createRoutes(dev: boolean = import.meta.env.DEV): RouteObject[] {
  return [
    { path: '/login', element: <RequireGuest><LoginPage /></RequireGuest> },
    { path: '/register', element: <RequireGuest><RegisterPage /></RequireGuest> },
    { path: '/check-inbox', element: <RequireGuest><CheckInboxPage /></RequireGuest> },
    // sample data only, no user data: reachable without logging in, and never in production
    ...(dev ? [{ path: '/dev/states', element: <DevStates /> }] : []),
    {
      element: <RequireAuth><AppShell /></RequireAuth>,
      children: [
        { path: '/', element: <Navigate to="/chat" replace /> },
        { path: '/library', element: <LibraryPage /> },
        { path: '/chat', element: <Placeholder title="New chat" /> },
        { path: '/chat/:id', element: <Placeholder title="Chat" /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ]
}
