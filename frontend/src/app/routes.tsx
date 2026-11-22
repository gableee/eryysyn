import { Navigate, type RouteObject } from 'react-router'
import { CheckInboxPage } from '../features/auth/CheckInboxPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AppShell } from './AppShell'
import { DevStates } from './DevStates'
import { RequireAuth, RequireGuest } from './guards'
import { Placeholder } from './Placeholder'

/** `dev` decides whether /dev/states exists; production builds never route it. */
export function createRoutes(dev: boolean = import.meta.env.DEV): RouteObject[] {
  return [
    { path: '/login', element: <RequireGuest><LoginPage /></RequireGuest> },
    { path: '/register', element: <RequireGuest><RegisterPage /></RequireGuest> },
    { path: '/check-inbox', element: <RequireGuest><CheckInboxPage /></RequireGuest> },
    {
      element: <RequireAuth><AppShell /></RequireAuth>,
      children: [
        { path: '/', element: <Navigate to="/chat" replace /> },
        { path: '/library', element: <Placeholder title="Library" /> },
        { path: '/chat', element: <Placeholder title="New chat" /> },
        { path: '/chat/:id', element: <Placeholder title="Chat" /> },
        ...(dev ? [{ path: '/dev/states', element: <DevStates /> }] : []),
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ]
}
