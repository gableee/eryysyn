import { AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
import { ApiError } from '../../shared/http'
import { useWorkspaceId } from '../../shared/workspace'
import { ErrorState } from '../../shared/ui/ErrorState'
import { DocumentRow } from './DocumentRow'
import { EmptyLibrary } from './EmptyLibrary'
import { isStillReading, useDelete, useDocuments, useRetry, useRunningUploads, useUpload } from './hooks'
import styles from './Library.module.css'
import { UploadButton } from './UploadButton'
import { UploadZone } from './UploadZone'
import { validateFile } from './validateFile'

/** Server errors in the same plain words as the browser-side checks. */
function uploadMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Upload failed. Try again.'
  if (error.kind === 'too_large') return 'This file is over 20 MB.'
  if (error.kind === 'unsupported') return 'Only PDF files for now.'
  if (error.kind === 'network') return "Can't reach the server"
  return 'Upload failed. Try again.'
}

export function LibraryPage() {
  const documents = useDocuments()
  const upload = useUpload()
  const retry = useRetry()
  const remove = useDelete()
  const [fileError, setFileError] = useState<string>()
  const { workspaceId } = useWorkspaceId()
  const running = useRunningUploads()          // uploads of this tab, also those started before leaving the page
  const busy = running.length > 0 || !workspaceId

  function choose(file: File) {
    if (!workspaceId) return                                     // still loading: nowhere to upload yet
    const problem = validateFile(file)
    setFileError(problem ?? undefined)
    if (problem) return
    upload.mutate(file, { onError: (e) => setFileError(uploadMessage(e)) })
  }

  // no workspace yet: nowhere to upload to
  const zone = <UploadZone onFile={choose} disabled={busy} error={fileError} />
  // The backend saves the row before reading the PDF, so a refresh during OUR upload can list it already:
  // show it once, as our uploading row.
  const docs = (documents.data ?? []).filter((d) => !(d.status === 'uploaded' && running.includes(d.filename)))

  const hasList = !documents.isLoading && !documents.isError && (docs.length > 0 || running.length > 0)
  const isEmpty = !documents.isLoading && !documents.isError && docs.length === 0 && running.length === 0
  const [dragging, setDragging] = useState(false)

  // A file dropped outside the drop area must not make the browser open it (and leave the app);
  // a drop anywhere, or a cancelled drag, also ends the outline.
  useEffect(() => {
    const keep = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    const end = (e: DragEvent) => { keep(e); setDragging(false) }
    window.addEventListener('dragover', keep)
    window.addEventListener('drop', end)
    return () => { window.removeEventListener('dragover', keep); window.removeEventListener('drop', end) }
  }, [])

  return (
    <section className={[styles.page, isEmpty && styles.pageEmpty, dragging && styles.dropping].filter(Boolean).join(' ')}
      aria-busy={documents.isLoading || undefined}
      // with documents there is no big zone: a PDF dropped anywhere on the page is uploaded
      onDragOver={hasList ? (e) => { e.preventDefault(); setDragging(true) } : undefined}
      // dragleave fires on the innermost element left; clear only when the pointer went somewhere outside the page
      onDragLeave={hasList ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) } : undefined}
      onDrop={hasList ? (e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f && !busy) choose(f) } : undefined}>
      <header className={styles.headerRow}>
        <div className={styles.header}>
          <h1>Library</h1>
          <p className={styles.sub}>Your documents. Only you can see them.</p>
        </div>
        {hasList && <UploadButton onFile={choose} disabled={busy} />}
      </header>
      {hasList && fileError && <p className={styles.zoneError} role="alert">{fileError}</p>}

      {documents.isError ? (
        <ErrorState
          message={documents.error instanceof ApiError && documents.error.kind === 'network'
            ? "Can't reach the server" : "Your documents couldn't be loaded."}
          onRetry={() => documents.refetch()} />
      ) : documents.isLoading ? (
        <ul className={styles.list} aria-label="Loading documents">
          {[0, 1, 2].map((i) => <li key={i} className={`${styles.row} ${styles.skeleton}`} />)}
        </ul>
      ) : isEmpty ? (
        <EmptyLibrary upload={zone} />
      ) : (
        <>
          {remove.isError && <ErrorState message="That document couldn't be deleted. Try again." />}
          <div className={styles.table}>
            {/* the headings are for the eye; each row also labels its date for screen readers */}
            <div className={styles.columns} aria-hidden="true"><span>Name</span><span>Added</span><span>Status</span></div>
            <ul className={styles.list} aria-label="Your documents">
              <AnimatePresence initial={false}>
                {running.map((name, i) => <DocumentRow key={`uploading-${i}-${name}`} doc={{ filename: name, status: 'uploading' }} />)}
                {docs.map((d) => (
                  // "uploaded" and recent: still being read (a reload or another tab) — no Try again, it would read
                  // it twice at once. "uploaded" and old: stuck (server restarted mid-reading), Try again like failed.
                  <DocumentRow key={d.id} doc={d}
                    busy={retry.isPending && retry.variables === d.id}
                    onRetry={isStillReading(d) ? undefined : () => retry.mutate(d.id)}
                    onDelete={() => remove.mutate(d.id)} />
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
