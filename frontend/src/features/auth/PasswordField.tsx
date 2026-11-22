import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import { TextField } from '../../shared/ui/TextField'
import styles from './Auth.module.css'

type Props = { value: string; onChange(v: string): void; hint?: string; autoComplete: string }

export function PasswordField({ value, onChange, hint, autoComplete }: Props) {
  const [shown, setShown] = useState(false)
  return (
    <div className={styles.password}>
      <TextField label="Password" type={shown ? 'text' : 'password'} value={value} hint={hint}
        autoComplete={autoComplete} required onChange={(e) => onChange(e.target.value)} />
      <IconButton className={styles.reveal} label={shown ? 'Hide password' : 'Show password'}
        icon={shown ? EyeOff : Eye} onClick={() => setShown(!shown)} />
    </div>
  )
}
