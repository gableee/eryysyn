import { SendHorizontal } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../../shared/ui/Button'
import styles from './Chat.module.css'

const MAX = 1000   // the backend's limit for a question

/** Enter sends, Shift+Enter adds a line. Blank never sends. */
export function Composer({ onSend, disabled }: { onSend(text: string): void; disabled: boolean }) {
  const [text, setText] = useState('')
  const blank = text.trim() === ''

  function send(e?: FormEvent) {
    e?.preventDefault()
    if (blank || disabled) return
    onSend(text.trim())
    setText('')
  }

  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an IME input (Japanese, Chinese…) must not send
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
  }

  return (
    <form className={styles.composer} onSubmit={send}>
      <textarea aria-label="Ask about your documents" placeholder="Ask about your documents…" rows={1}
        maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={keys}
        className={styles.input} />
      {text.length > MAX - 100 && <span className={styles.counter} aria-live="polite">{text.length} / {MAX}</span>}
      <Button variant="primary" type="submit" disabled={disabled || blank} aria-label="Ask">
        <SendHorizontal size={18} aria-hidden="true" /> <span className={styles.askLabel}>Ask</span>
      </Button>
    </form>
  )
}
