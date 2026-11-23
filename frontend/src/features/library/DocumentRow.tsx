import { CircleAlert, CircleCheck, FileText, LoaderCircle } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { InlineConfirm } from '../../shared/ui/InlineConfirm'
import styles from './Library.module.css'
import type { LibraryDocument, UploadingDocument } from './types'

type Props = { doc: LibraryDocument | UploadingDocument; onRetry?(): void; onDelete?(): void; busy?: boolean }

/** One document. Status is always an icon AND words, never colour alone. */
export function DocumentRow({ doc, onRetry, onDelete, busy = false }: Props) {
  const [confirming, setConfirming] = useState(false)
  // Rows slide to their new place when one is added or removed (Motion layout animation).
  const reduce = useReducedMotion()
  const motionProps = reduce ? {} : {
    layout: true as const,
    initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 },
    transition: { type: 'spring' as const, bounce: 0, duration: 0.25 },
  }

  if (confirming && onDelete) {
    return (
      <motion.li className={styles.row} {...motionProps}>
        <InlineConfirm question={`Delete ${doc.filename}?`} confirmLabel="Delete"
          onConfirm={() => { setConfirming(false); onDelete() }} onCancel={() => setConfirming(false)} />
      </motion.li>
    )
  }

  return (
    <motion.li className={styles.row} {...motionProps}>
      <span className={styles.title}>
        <FileText size={20} aria-hidden="true" className={styles.fileIcon} />
        <span className={styles.name}>{doc.filename}</span>
      </span>
      <Status status={doc.status} stuck={doc.status === 'uploaded' && !!onRetry} />
      <span className={styles.actions}>
        {(doc.status === 'failed' || doc.status === 'uploaded') && onRetry && (
          <Button variant="secondary" onClick={onRetry} busy={busy}>Try again</Button>
        )}
        {doc.status !== 'uploading' && onDelete && (
          <Button variant="quiet" aria-label={`Delete ${doc.filename}`} onClick={() => setConfirming(true)}>Delete</Button>
        )}
      </span>
    </motion.li>
  )
}

function Status({ status, stuck }: { status: LibraryDocument['status'] | 'uploading'; stuck?: boolean }) {
  if (stuck) return <span className={`${styles.status} ${styles.bad}`}><CircleAlert size={16} aria-hidden="true" />Didn't finish reading</span>
  if (status === 'indexed') return <span className={`${styles.status} ${styles.ok}`}><CircleCheck size={16} aria-hidden="true" />Ready</span>
  if (status === 'failed') return <span className={`${styles.status} ${styles.bad}`}><CircleAlert size={16} aria-hidden="true" />Couldn't read it</span>
  // 'uploading' (in the browser) and 'uploaded' (stored, not indexed yet): both mean "still working"
  return (
    <span className={styles.status} aria-live="polite">
      <LoaderCircle size={16} aria-hidden="true" className={styles.spin} />Uploading and reading… this can take a minute
    </span>
  )
}
