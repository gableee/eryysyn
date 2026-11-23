import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type SessionState = { session: Session | null; loading: boolean }

export const SessionContext = createContext<SessionState>({ session: null, loading: true })

/** Who is logged in. `loading` is true until Supabase has read the stored session. */
export function useSession(): SessionState {
  return useContext(SessionContext)
}
