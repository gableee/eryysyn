import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../../shared/supabase'
import { Button } from '../../shared/ui/Button'
import { TextField } from '../../shared/ui/TextField'
import styles from './Auth.module.css'
import { authMessage } from './authErrors'
import { GoogleButton } from './GoogleButton'
import { PasswordField } from './PasswordField'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) setError(authMessage(authError))
      else navigate('/')
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <h1>Log in to Eryysyn</h1>
        <GoogleButton />
        <TextField label="Email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button variant="primary" type="submit" busy={busy}>Log in</Button>
        <p className={styles.switch}>New here? <Link to="/register">Create an account</Link></p>
      </form>
    </main>
  )
}
