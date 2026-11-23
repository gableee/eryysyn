/** Supabase auth errors in plain words. Unknown ones keep Supabase's own message. */
export function authMessage(error: unknown): string {
  if (error instanceof TypeError) return "Can't reach the server"        // fetch failed: offline / server down
  const e = error as { message?: string; status?: number; name?: string }
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) return "Can't reach the server"
  if (e.message === 'Invalid login credentials') return 'Wrong email or password'
  if (e.message === 'Email not confirmed') return 'Open the link we emailed you first, then log in.'
  return e.message ?? 'Something went wrong. Try again.'
}
