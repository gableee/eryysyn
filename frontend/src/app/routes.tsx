import { Navigate, type RouteObject } from 'react-router'
import { CheckInboxPage } from '../features/auth/CheckInboxPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AppShell } from './AppShell'
import { AuthLayout } from './AuthLayout'
import { DevStates } from './DevStates'
import { RequireAuth, RequireGuest } from './guards'
import { ChatList } from '../features/chat/ChatList'
import { ChatPage } from '../features/chat/ChatPage'
import { RootRedirect } from '../features/chat/RootRedirect'
import { LibraryPage } from '../features/library/LibraryPage'
import { SidebarExtraContext } from './ShellContext'
import { ReaderRoute } from './ReaderRoute'

/** `dev` decides whether /dev/states exists; production builds never route it. */
export function createRoutes(dev: boolean = import.meta.env.DEV): RouteObject[] {
  return [
    { path: '/login', element: <RequireGuest><AuthLayout><LoginPage /></AuthLayout></RequireGuest> },
    { path: '/register', element: <RequireGuest><AuthLayout><RegisterPage /></AuthLayout></RequireGuest> },
    { path: '/check-inbox', element: <RequireGuest><AuthLayout><CheckInboxPage /></AuthLayout></RequireGuest> },
    // sample data only, no user data: reachable without logging in, and never in production
    ...(dev ? [{ path: '/dev/states', element: <DevStates /> }] : []),
    {
      element: (
        <RequireAuth>
          <SidebarExtraContext.Provider value={<ChatList />}><AppShell /></SidebarExtraContext.Provider>
        </RequireAuth>
      ),
      children: [
        { path: '/', element: <RootRedirect /> },
        { path: '/library', element: <LibraryPage /> },
        // one route with an optional id: creating a chat changes the URL without rebuilding the page
        { path: '/chat/:id?', element: <ChatPage /> },
        // the Reader: full window (the shell reads this handle), its code loaded on demand
        { path: '/documents/:id', element: <ReaderRoute />, handle: { reader: true } },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ]
}
