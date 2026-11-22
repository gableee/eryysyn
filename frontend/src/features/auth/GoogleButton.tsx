import { useState } from 'react'
import { supabase } from '../../shared/supabase'
import { Button } from '../../shared/ui/Button'
import { authMessage } from './authErrors'

/** Shown only when Google sign-in is configured (VITE_AUTH_GOOGLE=true); never a dead button. */
export function GoogleButton() {
  const [error, setError] = useState('')
  if (import.meta.env.VITE_AUTH_GOOGLE !== 'true') return null
  async function start() {
    setError('')
    // Supabase sends the user to Google, then back to this site (PKCE: a one-time code, no tokens in the URL).
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin },
    })
    if (e) setError(authMessage(e))
  }
  return (
    <>
      <Button variant="secondary" onClick={start}>Continue with Google</Button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
