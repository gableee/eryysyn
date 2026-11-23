/**
 * Who is logged in, for the whole app.
 *
 * Security: when the user signs out, or a DIFFERENT user signs in, every cached API result is
 * dropped (queryClient.clear()), so on a shared computer the next person never sees the previous
 * person's chats or documents, not even for a moment. A 401 from our API signs out.
 */
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { setUnauthorizedHandler } from '../../shared/http'
import { supabase } from '../../shared/supabase'
import { SessionContext, type SessionState } from './useSession'

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>({ session: null, loading: true })
  const userId = useRef<string | null>(null)

  useEffect(() => {
    function apply(session: Session | null) {
      const next = session?.user.id ?? null
      if (next !== userId.current) queryClient.clear()   // signed out, or someone else signed in
      userId.current = next
      setState({ session, loading: false })
    }
    supabase.auth.getSession().then(({ data }) => {
      userId.current = data.session?.user.id ?? null   // first load: nothing cached yet to clear
      setState({ session: data.session, loading: false })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session))
    setUnauthorizedHandler(() => { void supabase.auth.signOut() })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}
