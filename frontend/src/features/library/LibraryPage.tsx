import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { ApiError } from '../../shared/http'
import { useWorkspaceId } from '../../shared/workspace'
import { ErrorState } from '../../shared/ui/ErrorState'
import { DocumentRow } from './DocumentRow'
import { EmptyLibrary } from './EmptyLibrary'
import { useDelete, useDocuments, useRetry, useUpload } from './hooks'
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

  function choose(file: File) {
    if (!workspaceId) return                                     // still loading: nowhere to upload yet
    const problem = validateFile(file)
    setFileError(problem ?? undefined)
    if (problem) return
    upload.mutate(file, { onError: (e) => setFileError(uploadMessage(e)) })
  }

  // no workspace yet: nowhere to upload to
  const zone = <UploadZone onFile={choose} disabled={upload.isPending || !workspaceId} error={fileError} />
  const uploading = upload.isPending && upload.variables ? upload.variables.name : null
  // The backend saves the row before reading the PDF, so a refresh during OUR upload can list it already:
  // show it once, as our uploading row.
  const docs = (documents.data ?? []).filter((d) => !(uploading && d.status === 'uploaded' && d.filename === uploading))

  const hasList = !documents.isLoading && !documents.isError && (docs.length > 0 || !!uploading)
  const [dragging, setDragging] = useState(false)

  return (
    <section className={[styles.page, dragging && styles.dropping].filter(Boolean).join(' ')}
      aria-busy={documents.isLoading || undefined}
      // with documents there is no big zone: a PDF dropped anywhere on the page is uploaded
      onDragOver={hasList ? (e) => { e.preventDefault(); setDragging(true) } : undefined}
      onDragLeave={hasList ? (e) => { if (e.currentTarget === e.target) setDragging(false) } : undefined}
      onDrop={hasList ? (e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f && !upload.isPending && workspaceId) choose(f) } : undefined}>
      <header className={styles.headerRow}>
        <div className={styles.header}>
          <h1>Library</h1>
          <p className={styles.sub}>Your documents. Only you can see them.</p>
        </div>
        {hasList && <UploadButton onFile={choose} disabled={upload.isPending || !workspaceId} />}
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
      ) : docs.length === 0 && !uploading ? (
        <EmptyLibrary upload={zone} />
      ) : (
        <>
          {remove.isError && <ErrorState message="That document couldn't be deleted. Try again." />}
          <ul className={styles.list} aria-label="Your documents">
            <AnimatePresence initial={false}>
              {uploading && <DocumentRow key="uploading" doc={{ filename: uploading, status: 'uploading' }} />}
              {docs.map((d) => (
                // "uploaded" here means stuck: no upload in this tab owns it (tab closed or server restarted
                // mid-reading). It gets Try again, like a failed one.
                <DocumentRow key={d.id} doc={d}
                  busy={retry.isPending && retry.variables === d.id}
                  onRetry={() => retry.mutate(d.id)}
                  onDelete={() => remove.mutate(d.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </section>
  )
}
