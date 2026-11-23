import { Upload } from 'lucide-react'
import { useId } from 'react'
import styles from './Library.module.css'

/** Once documents exist the list matters most: uploading becomes one button (dropping on the page still works). */
export function UploadButton({ onFile, disabled }: { onFile(file: File): void; disabled: boolean }) {
  const inputId = useId()
  return (
    <span className={[styles.uploadButton, disabled && styles.disabled].filter(Boolean).join(' ')}>
      <input id={inputId} type="file" accept="application/pdf,.pdf" disabled={disabled} className={styles.fileInput}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <label htmlFor={inputId} className={styles.choose}>
        <Upload size={16} aria-hidden="true" /> Upload PDF
      </label>
    </span>
  )
}
