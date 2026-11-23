import { createClient } from '@supabase/supabase-js'

// The publishable (anon) key is meant to be public: what a user may touch is decided by the
// backend and Supabase, never by hiding this key. Never put the service_role key in the frontend.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  // PKCE: the OAuth login (Google) exchanges a one-time code instead of putting tokens in the URL.
  { auth: { flowType: 'pkce' } },
)
