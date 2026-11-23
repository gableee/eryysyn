import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { SessionProvider } from '../features/auth/SessionProvider'
import { ApiError } from '../shared/http'
import { createRoutes } from './routes'

const router = createBrowserRouter(createRoutes())

export function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Retry once for network and server hiccups; never retry "not found", "not yours", "invalid".
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status !== null && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  }))
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  )
}
