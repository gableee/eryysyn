import { FileUp } from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'
import styles from './Library.module.css'

type Props = { onFile(file: File): void; disabled: boolean; error?: string }

/** Drop a PDF or choose one. The real <input type="file"> stays in the page (keyboard and screen readers). */
export function UploadZone({ onFile, disabled, error }: Props) {
  const inputId = useId()
  const [over, setOver] = useState(false)

  function drop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file && !disabled) onFile(file)
  }

  return (
    <div className={[styles.zone, over && styles.over, disabled && styles.disabled].filter(Boolean).join(' ')}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true) }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <FileUp size={28} aria-hidden="true" className={styles.zoneIcon} />
      <p className={styles.zoneTitle}>Drop a PDF here, or</p>
      <label htmlFor={inputId} className={styles.choose}>Choose a file</label>
      <input id={inputId} type="file" accept="application/pdf,.pdf" disabled={disabled} className={styles.fileInput}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <p className={styles.limits}>PDF · up to 20 MB</p>
      {error && <p className={styles.zoneError} role="alert">{error}</p>}
    </div>
  )
}
