import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../../shared/supabase'
import { Button } from '../../shared/ui/Button'
import { TextField } from '../../shared/ui/TextField'
import styles from './Auth.module.css'
import { authMessage } from './authErrors'
import { GoogleButton } from './GoogleButton'
import { PasswordField } from './PasswordField'

// NIST 800-63B: length matters, composition rules ("must have a symbol") do not. Supabase enforces
// the same minimum (Authentication > Providers > Email > Minimum password length = 8); this check
// only gives the message sooner. Login does not check it: older accounts may have 6 characters.
export const MIN_PASSWORD = 8

/**
 * Works whether Supabase's "Confirm email" is on or off:
 *   a session comes back  -> confirmation is off, the user is in: go to the Library
 *   no session            -> confirmation is on: "check your inbox"
 * An email that already has an account comes back as an error (confirmation off) or as a user with
 * no identities (confirmation on: Supabase hides which emails exist). Both get the same message.
 */
export function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [exists, setExists] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setExists(false)
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`)
      return
    }
    setBusy(true)
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin },
      })
      if (authError?.message?.toLowerCase().includes('already registered') || data?.user?.identities?.length === 0) {
        setExists(true)
      } else if (authError) {
        setError(authMessage(authError))
      } else if (data.session) {
        navigate('/library')
      } else {
        navigate('/check-inbox', { state: { email } })
      }
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
          <form className={styles.card} onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <GoogleButton />
        <TextField label="Email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <PasswordField value={password} onChange={setPassword} autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD} characters`} />
        {exists && (
          <p className={styles.error} role="alert">
            This email already has an account. <Link to="/login">Log in</Link>
          </p>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button variant="primary" type="submit" busy={busy}>Create account</Button>
        <p className={styles.switch}>Already have an account? <Link to="/login">Log in</Link></p>
      </form>
  )
}
